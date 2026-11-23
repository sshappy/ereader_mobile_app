import { sha256 } from 'js-sha256';

import { ErrorCode } from '../../constants/errorCodes';
import {
  binaryStringToBytes,
  bytesToBase64,
  bytesToBinaryString,
} from '../../utils/base64';
import { AppError, asAppError } from '../../utils/errors';
import { logger } from '../../utils/logger';
import type { Base64, IFileService } from '../fileService';

export const DEFAULT_TTS_TIMEOUT_MS = 12000;

/** Edge 免费朗读端点的公开 TrustedClientToken（非官方接口，可能变动）。 */
const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23E68491F0B6D';
const EDGE_ENDPOINT =
  'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1';

export interface IEdgeTtsClient {
  synthesize(text: string, voiceId: string, rate: number, timeoutMs: number): Promise<string>;
}

interface EdgeWebSocket {
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onclose: ((event: unknown) => void) | null;
  send(message: string): void;
  close(): void;
}

type WebSocketConstructor = new (
  url: string,
  protocols?: unknown,
  options?: unknown,
) => EdgeWebSocket;

export interface EdgeFrame {
  path: string;
  headers: string;
  payload: string;
}

/** 生成随机 ConnectionId（纯 JS，不依赖 crypto 模块）。 */
function createConnectionId(): string {
  const random = () => Math.floor(Math.random() * 0x100000000).toString(16).padStart(8, '0');
  return `${random()}${random()}-${random()}-${random()}-${random()}-${random()}${random()}${random()}`;
}

/**
 * Edge 握手用 Sec-MS-GEC：Windows FILETIME 按 5 分钟窗口取 sha256。
 * 接口字段变动时只需修改本文件（架构待明确事项 A-1）。
 */
export function createSecMsGec(nowMs: number): string {
  const seconds = BigInt(Math.floor(nowMs / 1000) + 11644473600);
  const ticks = seconds * 10000000n;
  const window = (ticks / (300n * 10000000n)).toString();
  return sha256(window).toUpperCase();
}

export function buildEdgeUrl(nowMs: number = Date.now()): string {
  const params = [
    `TrustedClientToken=${TRUSTED_CLIENT_TOKEN}`,
    `Sec-MS-GEC=${createSecMsGec(nowMs)}`,
    'Sec-MS-GEC-Version=1-130614134000000000',
    `ConnectionId=${createConnectionId()}`,
  ];
  return `${EDGE_ENDPOINT}?${params.join('&')}`;
}

/** SSML 组装；rate=1.0 → +0%，0.5 → -50%，2.0 → +100%。 */
export function buildSsml(text: string, voiceId: string, rate: number): string {
  const percent = Math.round((rate - 1) * 100);
  const rateText = `${percent >= 0 ? '+' : ''}${percent}%`;
  const escaped = (text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
  return (
    '<speak version="1.0" xmlns="http://www.w3.org/2001/10/Synthesis" ' +
    'xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="zh-CN">' +
    `<voice name="${voiceId}"><mstts:express-as style="general">` +
    `<prosody rate="${rateText}">${escaped}</prosody>` +
    '</mstts:express-as></voice></speak>'
  );
}

function envelope(path: string, contentType: string, payload: string): string {
  return (
    `X-Timestamp:${new Date().toISOString()}\r\n` +
    `Content-Type:${contentType}\r\n` +
    `Path:${path}\r\n\r\n${payload}`
  );
}

/** 解析 WS 帧：兼容 string、ArrayBuffer 与 TypedArray。 */
export function parseFrame(data: unknown): EdgeFrame | null {
  let raw = '';
  if (typeof data === 'string') {
    raw = data;
  } else if (typeof ArrayBuffer !== 'undefined' && data instanceof ArrayBuffer) {
    raw = bytesToBinaryString(new Uint8Array(data));
  } else if (data && typeof data === 'object' && 'byteLength' in data) {
    const view = data as ArrayBufferView;
    raw = bytesToBinaryString(
      new Uint8Array(view.buffer, view.byteOffset, view.byteLength),
    );
  } else {
    return null;
  }

  const split = raw.indexOf('\r\n\r\n');
  if (split < 0) {
    return { path: '', headers: '', payload: raw };
  }
  const headers = raw.slice(0, split);
  const pathMatch = /^Path:\s*(.+)$/im.exec(headers);
  return {
    path: pathMatch?.[1]?.trim() ?? '',
    headers,
    payload: raw.slice(split + 4),
  };
}

/**
 * Edge TTS 客户端：WS 握手 + token + SSML + audio 分片收集 + 超时。
 * 所有异常归一到 E_TTS_*；成功后音频 base64 写入 IFileService 缓存。
 */
export class EdgeTtsClient implements IEdgeTtsClient {
  private readonly fileService: IFileService;

  constructor(fileService: IFileService) {
    this.fileService = fileService;
  }

  synthesize(
    text: string,
    voiceId: string,
    rate: number,
    timeoutMs: number = DEFAULT_TTS_TIMEOUT_MS,
  ): Promise<string> {
    if (!text || text.trim().length === 0) {
      return Promise.reject(new AppError(ErrorCode.E_TTS_SERVICE, '朗读文本为空'));
    }
    const safeRate = Number.isFinite(rate) && rate > 0 ? rate : 1;
    const ssml = buildSsml(text, voiceId, safeRate);

    return new Promise<string>((resolve, reject) => {
      let settled = false;
      let socket: EdgeWebSocket | null = null;
      let timer: ReturnType<typeof setTimeout> | null = null;
      const chunks: string[] = [];

      const clearTimer = (): void => {
        if (timer !== null) {
          clearTimeout(timer);
          timer = null;
        }
      };
      const fail = (error: unknown): void => {
        if (settled) return;
        settled = true;
        clearTimer();
        try {
          socket?.close();
        } catch (closeError) {
          logger.debug('关闭 WS 失败', closeError);
        }
        reject(asAppError(error, ErrorCode.E_TTS_SERVICE));
      };
      const succeed = async (): Promise<void> => {
        if (settled) return;
        if (chunks.length === 0) {
          fail(new AppError(ErrorCode.E_TTS_SERVICE, '未收到云端音频数据'));
          return;
        }
        settled = true;
        clearTimer();
        try {
          const audio: Base64 = bytesToBase64(
            binaryStringToBytes(chunks.join('')),
          );
          const uri = await this.fileService.writeCacheFile('edge-tts.mp3', audio);
          resolve(uri);
        } catch (error) {
          reject(asAppError(error, ErrorCode.E_TTS_SERVICE));
        }
      };

      try {
        const Ctor = (
          globalThis as unknown as { WebSocket?: WebSocketConstructor }
        ).WebSocket;
        if (!Ctor) {
          fail(new AppError(ErrorCode.E_TTS_NETWORK, '当前环境不支持 WebSocket'));
          return;
        }
        socket = new Ctor(buildEdgeUrl(), undefined, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
            Origin: 'https://edge.microsoft.com',
          },
        });

        timer = setTimeout(() => {
          fail(new AppError(ErrorCode.E_TTS_TIMEOUT));
        }, Math.max(1, timeoutMs));

        socket.onopen = () => {
          if (!socket || settled) return;
          try {
            socket.send(
              envelope(
                'speech.config',
                'application/json; charset=utf-8',
                JSON.stringify({
                  context: {
                    synthesis: {
                      audio: {
                        metadataoptions: { sentenceBoundaryEnabled: false, wordBoundaryEnabled: false },
                        outputFormat: 'audio-24khz-48kbitrate-mono-mp3',
                      },
                    },
                  },
                }),
              ),
            );
            socket.send(
              envelope(
                'synthesis.start',
                'application/json; charset=utf-8',
                JSON.stringify({
                  context: {
                    synthesis: {
                      audio: {
                        metadataoptions: { sentenceBoundaryEnabled: false, wordBoundaryEnabled: false },
                        outputFormat: 'audio-24khz-48kbitrate-mono-mp3',
                      },
                    },
                  },
                }),
              ),
            );
            socket.send(
              envelope('ssml', 'application/ssml+xml', ssml),
            );
          } catch (error) {
            fail(asAppError(error, ErrorCode.E_TTS_SERVICE));
          }
        };

        socket.onmessage = (event) => {
          if (settled) return;
          try {
            const frame = parseFrame(event?.data);
            if (!frame) return;
            if (frame.path.toLowerCase().includes('audio') && frame.payload.length > 0) {
              chunks.push(frame.payload);
            }
          } catch (error) {
            fail(asAppError(error, ErrorCode.E_TTS_SERVICE));
          }
        };

        socket.onerror = (event) => {
          fail(new AppError(ErrorCode.E_TTS_NETWORK, `云端朗读连接错误：${String(event ?? '')}`));
        };

        socket.onclose = () => {
          void succeed();
        };
      } catch (error) {
        fail(asAppError(error, ErrorCode.E_TTS_NETWORK));
      }
    });
  }
}
