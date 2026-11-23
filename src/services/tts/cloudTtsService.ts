import type {
  SpeakOptions,
  TTSConfig,
  TtsHandlers,
  Voice,
} from '../../types';
import { ErrorCode } from '../../constants/errorCodes';
import { AppError, asAppError } from '../../utils/errors';
import { logger } from '../../utils/logger';
import { splitToSegments, SEGMENT_MAX_CHARS } from '../../utils/text';
import type { IFileService } from '../fileService';
import type { IAudioPlayer } from './audioPlayerService';
import { DEFAULT_TTS_TIMEOUT_MS, type IEdgeTtsClient } from './edgeTtsClient';
import type { ITtsEngine } from './ttsService';

/** Edge 常用中文嗓音（P1 可在设置页切换）。 */
export const CLOUD_VOICES: Voice[] = [
  { id: 'zh-CN-XiaoxiaoNeural', name: '晓晓（女）', language: 'zh-CN', channel: 'cloud' },
  { id: 'zh-CN-YunxiNeural', name: '云希（男）', language: 'zh-CN', channel: 'cloud' },
  { id: 'zh-CN-XiaoyiNeural', name: '晓伊（女）', language: 'zh-CN', channel: 'cloud' },
  { id: 'en-US-JennyNeural', name: 'Jenny（女）', language: 'en-US', channel: 'cloud' },
];

export interface CloudTtsDeps {
  client: IEdgeTtsClient;
  player: IAudioPlayer;
  fileService?: IFileService;
  timeoutMs?: number;
}

/**
 * 云端 TTS：分片队列逐个"合成 → 播放 → 推进"，章末上报 onChapterEnd。
 * 任何失败均通过 handlers.onError 上报 E_TTS_*，并立即停止队列；
 * cloudConsent=false 时不发起任何网络请求。
 */
export class CloudTtsService implements ITtsEngine {
  readonly channel = 'cloud' as const;

  private readonly client: IEdgeTtsClient;
  private readonly player: IAudioPlayer;
  private readonly fileService?: IFileService;
  private readonly timeoutMs: number;
  private config: TTSConfig | null = null;
  private stopped = false;
  private audioUris: string[] = [];

  constructor(deps: CloudTtsDeps) {
    this.client = deps.client;
    this.player = deps.player;
    this.fileService = deps.fileService;
    this.timeoutMs = deps.timeoutMs ?? DEFAULT_TTS_TIMEOUT_MS;
  }

  async prepare(config: TTSConfig): Promise<void> {
    this.config = config;
    this.player.setRate(config.rate);
  }

  async speak(options: SpeakOptions, handlers: TtsHandlers): Promise<void> {
    if (!options.text || options.text.trim().length === 0) {
      return;
    }
    if (this.config && !this.config.cloudConsent) {
      const error = new AppError(ErrorCode.E_TTS_CONSENT_REQUIRED);
      handlers.onStateChange?.('error');
      handlers.onError?.(error);
      return;
    }

    this.stopped = false;
    this.audioUris = [];
    const segments = splitToSegments(options.text);
    let charOffset = 0;

    try {
      handlers.onStateChange?.('loading');
      for (const segment of segments) {
        if (this.stopped) {
          break;
        }
        if (segment.text.length > SEGMENT_MAX_CHARS) {
          throw new AppError(ErrorCode.E_TTS_SERVICE, '文本片段超出长度限制');
        }
        const voiceId = options.voiceId || this.config?.cloudVoiceId || CLOUD_VOICES[0].id;
        const rate = Number.isFinite(options.rate) ? options.rate : 1;
        handlers.onStateChange?.('loading');
        const audioUri = await this.client.synthesize(
          segment.text,
          voiceId,
          rate,
          this.timeoutMs,
        );
        if (this.stopped) {
          break;
        }
        segment.audioUri = audioUri;
        this.audioUris.push(audioUri);
        handlers.onStateChange?.('playing');
        await new Promise<void>((resolve, reject) => {
          this.player
            .play(
              audioUri,
              () => resolve(),
              (error) => reject(error),
            )
            .catch(reject);
        });
        if (this.stopped) {
          break;
        }
        charOffset += segment.text.length;
        handlers.onBoundary?.(segment.index, charOffset);
      }
      if (!this.stopped) {
        handlers.onStateChange?.('stopped');
        handlers.onChapterEnd?.();
      }
    } catch (error) {
      if (this.stopped) {
        return;
      }
      const appError = asAppError(error, ErrorCode.E_TTS_SERVICE);
      logger.warn('云端 TTS 失败', appError.code, appError.message);
      handlers.onStateChange?.('error');
      handlers.onError?.(appError);
    }
  }

  async pause(): Promise<void> {
    if (!this.stopped) {
      this.player.pause();
    }
  }

  async resume(): Promise<void> {
    if (!this.stopped) {
      this.player.resume();
    }
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.player.stop();
    const uris = this.audioUris;
    this.audioUris = [];
    if (this.fileService) {
      for (const uri of uris) {
        try {
          await this.fileService.remove(uri);
        } catch (error) {
          logger.debug('清理云端音频缓存失败', error);
        }
      }
    }
  }

  async getVoices(): Promise<Voice[]> {
    return CLOUD_VOICES.map((voice) => ({ ...voice }));
  }

  async destroy(): Promise<void> {
    await this.stop();
    this.config = null;
  }
}
