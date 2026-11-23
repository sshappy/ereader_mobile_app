import type { Book, BookMetadata, Chapter } from '../../types';
import { CONVERT_TO_EPUB_HINT } from '../../constants/compliance';
import { ErrorCode } from '../../constants/errorCodes';
import {
  binaryStringToBytes,
  bytesToBase64,
  decodeBase64,
  readUInt16BE,
  readUInt32BE,
  simpleHash,
} from '../../utils/base64';
import { AppError } from '../../utils/errors';
import { logger } from '../../utils/logger';
import type { Base64 } from '../fileService';
import { formatFromFileName } from '../fileService';
import type { IBookParser } from './bookParser';

const CONVERSION_MESSAGE = `MOBI/AZW 解析失败，${CONVERT_TO_EPUB_HINT}`;

const WINDOWS_1252: Record<number, string> = {
  0x80: '€', 0x82: '‚', 0x83: 'ƒ', 0x84: '„', 0x85: '…', 0x86: '†', 0x87: '‡',
  0x88: 'ˆ', 0x89: '‰', 0x8a: 'Š', 0x8b: '‹', 0x8c: 'Œ', 0x8e: 'Ž', 0x91: '‘',
  0x92: '’', 0x93: '“', 0x94: '”', 0x95: '•', 0x96: '–', 0x97: '—', 0x98: '˜',
  0x99: '™', 0x9a: 'š', 0x9b: '›', 0x9c: 'œ', 0x9e: 'ž', 0x9f: 'Ÿ',
};

/** 手动 UTF-8 解码，避免依赖 Hermes 未必提供的 TextDecoder。 */
function decodeUtf8(bytes: Uint8Array): string {
  let result = '';
  let i = 0;
  while (i < bytes.length) {
    const first = bytes[i++];
    if (first < 0x80) {
      result += String.fromCharCode(first);
      continue;
    }
    let code = 0;
    let extra = 0;
    if ((first & 0xe0) === 0xc0) {
      code = first & 0x1f;
      extra = 1;
    } else if ((first & 0xf0) === 0xe0) {
      code = first & 0x0f;
      extra = 2;
    } else if ((first & 0xf8) === 0xf0) {
      code = first & 0x07;
      extra = 3;
    } else {
      result += '\ufffd';
      continue;
    }
    let valid = true;
    for (let k = 0; k < extra; k += 1) {
      if (i >= bytes.length) {
        valid = false;
        break;
      }
      const next = bytes[i++];
      if ((next & 0xc0) !== 0x80) {
        valid = false;
        break;
      }
      code = (code << 6) | (next & 0x3f);
    }
    result += valid ? String.fromCodePoint(code) : '\ufffd';
  }
  return result;
}

function decodeWindows1252(bytes: Uint8Array): string {
  let result = '';
  for (let i = 0; i < bytes.length; i += 1) {
    result += WINDOWS_1252[bytes[i]] ?? String.fromCharCode(bytes[i]);
  }
  return result;
}

/** PalmDOC LZ77 解压（纯 JS，无原生依赖）。 */
function palmDocDecompress(data: Uint8Array): Uint8Array {
  const output: number[] = [];
  let i = 0;
  while (i < data.length) {
    const code = data[i++];
    if (code === 0) {
      output.push(0);
    } else if (code >= 1 && code <= 8) {
      for (let n = 0; n < code; n += 1) {
        output.push(data[i++] ?? 0);
      }
    } else if (code <= 0x7f) {
      output.push(code);
    } else if (code >= 0xc0) {
      output.push(code ^ 0x80);
    } else {
      const pair = ((code & 0x3f) << 8) | (data[i++] ?? 0);
      const distance = pair >> 3;
      const length = (pair & 0x07) + 3;
      if (distance === 0 || distance > output.length) {
        output.push(32);
        continue;
      }
      for (let n = 0; n < length; n += 1) {
        output.push(output[output.length - distance]);
      }
    }
  }
  return new Uint8Array(output);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function normalizeText(value: string): string {
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
}

interface ChapterSource {
  title: string;
  text: string;
}

/** 按常见中英文章标题切分；无匹配时整本作为一个章节。 */
function splitChapters(rawText: string): ChapterSource[] {
  const pattern = /(第[零一二三四五六七八九十百千万两\d]+[章节回卷部篇]|Chapter\s+\d+[.:：-]?)/g;
  const boundaries: Array<{ index: number; title: string }> = [];
  let match: RegExpExecArray | null = pattern.exec(rawText);
  while (match !== null && boundaries.length < 500) {
    if (match.index > 0) {
      boundaries.push({ index: match.index, title: match[0].trim() });
    }
    match = pattern.exec(rawText);
  }

  if (boundaries.length === 0) {
    const text = normalizeText(rawText);
    return text.length > 0 ? [{ title: '正文', text }] : [];
  }

  const sources: ChapterSource[] = [];
  let start = 0;
  for (const boundary of boundaries) {
    const text = normalizeText(rawText.slice(start, boundary.index));
    if (text.length > 0) {
      sources.push({ title: '正文', text });
    }
    start = boundary.index;
  }
  const tail = normalizeText(rawText.slice(start));
  if (tail.length > 0) {
    sources.push({ title: boundaries[boundaries.length - 1]?.title ?? '正文', text: tail });
  }
  return sources;
}

/**
 * MOBI/AZW/AZW3 纯 JS best-effort 解析（P1）。
 * 支持 PalmDB + PalmDOC(LZ77) 的无 DRM 文件；任何失败只给出转换引导，
 * 不引入需要本机编译 .so / 静态库的方案，也不包含任何解密逻辑。
 */
export class MobiParser implements IBookParser {
  readonly format: 'mobi' | 'azw' | 'azw3';

  constructor(format: 'mobi' | 'azw' | 'azw3' = 'mobi') {
    this.format = format;
  }

  canHandle(fileName: string, base64: Base64): boolean {
    return formatFromFileName(fileName) === this.format && base64.trim().length > 0;
  }

  async parse(base64: Base64, fileName: string): Promise<Book> {
    try {
      const bytes = decodeBase64(base64);
      if (bytes.length < 96) {
        throw new Error('文件头不完整');
      }
      const recordCount = readUInt16BE(bytes, 76);
      if (recordCount < 2 || bytes.length < 78 + recordCount * 8) {
        throw new Error('PalmDB 记录表无效');
      }
      const record0 = readUInt32BE(bytes, 78);
      const magic = String.fromCharCode(
        bytes[record0 + 16] ?? 0,
        bytes[record0 + 17] ?? 0,
        bytes[record0 + 18] ?? 0,
        bytes[record0 + 19] ?? 0,
      );
      if (magic !== 'MOBI') {
        throw new Error('缺少 MOBI 头');
      }

      // MOBI 头偏移 16/20 为 drm_offset / drm_count；非 0 即拒绝，绝不尝试解密。
      const drmOffset = readUInt32BE(bytes, record0 + 16 + 16);
      const drmCount = readUInt32BE(bytes, record0 + 16 + 20);
      if (drmOffset !== 0 || drmCount !== 0) {
        throw new AppError(ErrorCode.E_DRM_DETECTED);
      }

      const compression = readUInt16BE(bytes, record0);
      if (compression === 2) {
        throw new Error('HUFFDIC 压缩暂不支持');
      }
      if (compression !== 1 && compression !== 0) {
        throw new Error(`未知压缩方式 ${compression}`);
      }

      // MOBI 头内 text encoding 偏移：MOBI 起始 + 12。
      const encodingValue = readUInt32BE(bytes, record0 + 16 + 12);
      const decode = encodingValue === 65001 ? decodeUtf8 : decodeWindows1252;

      const parts: string[] = [];
      for (let index = 1; index < recordCount; index += 1) {
        const offset = readUInt32BE(bytes, 78 + index * 8);
        const nextOffset =
          index + 1 < recordCount
            ? readUInt32BE(bytes, 78 + (index + 1) * 8)
            : bytes.length;
        if (offset >= nextOffset || offset >= bytes.length) {
          continue;
        }
        const chunk = bytes.slice(offset, Math.min(nextOffset, bytes.length));
        const decompressed = compression === 1 ? palmDocDecompress(chunk) : chunk;
        parts.push(decode(decompressed));
      }

      const rawText = parts.join('');
      if (rawText.trim().length === 0) {
        throw new Error('未提取到可读正文');
      }
      const sources = splitChapters(rawText);
      if (sources.length === 0) {
        throw new Error('正文为空');
      }

      const now = Date.now();
      const chapters: Chapter[] = sources.map((source, index) => {
        const html = source.text
          .split(/\n{2,}/)
          .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br />')}</p>`)
          .join('');
        return {
          id: `ch-${String(index).padStart(4, '0')}`,
          index,
          title: source.title || `第 ${index + 1} 章`,
          href: `text/chapter-${index}.xhtml`,
          html,
          text: source.text,
          charCount: source.text.length,
        };
      });

      const firstLine = chapters[0]?.text.split('\n')[0] ?? '';
      const metadata: BookMetadata = {
        title: firstLine.slice(0, 120) || fileName.replace(/\.[^.]+$/, ''),
      };
      return {
        id: simpleHash(
          `${fileName}:${base64.length}:${base64.slice(0, 1024)}:${base64.slice(-1024)}`,
        ),
        format: this.format,
        metadata,
        sourcePath: '',
        originFileName: fileName,
        fileSize: base64.length,
        chapters,
        addedAt: now,
        lastOpenedAt: now,
      };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      const detail = error instanceof Error ? error.message : '未知错误';
      logger.warn('MOBI parse failed', detail);
      throw new AppError(ErrorCode.E_PARSE_FAILED, `${CONVERSION_MESSAGE}（${detail}）`);
    }
  }

  /** 测试辅助：把正文编码为 PalmDB + PalmDOC 的最小样本（不写入文件系统）。 */
  static buildSample(base64Text: string, utf8 = true): string {
    const textBytes =
      utf8 && typeof TextEncoder !== 'undefined'
        ? new TextEncoder().encode(base64Text)
        : binaryStringToBytes(base64Text);
    // 最小 PalmDOC 记录：compression=1，textLength=原文长度，recordCount=1，recordSize=4096。
    const docHeader = new Uint8Array(16);
    new DataView(docHeader.buffer).setUint16(0, 1); // PalmDOC 压缩
    new DataView(docHeader.buffer).setUint32(4, textBytes.length);
    new DataView(docHeader.buffer).setUint16(8, 1);
    new DataView(docHeader.buffer).setUint16(12, 4096);

    // MOBI 头 32 字节：magic(0)、encoding(12)、drm_offset(16)、drm_count(20) 均为 0。
    const mobiHeader = new Uint8Array(32);
    mobiHeader.set([0x4d, 0x4f, 0x42, 0x49], 0); // 'MOBI'
    new DataView(mobiHeader.buffer).setUint32(12, utf8 ? 65001 : 1252);

    const record0 = new Uint8Array(docHeader.length + mobiHeader.length);
    record0.set(docHeader, 0);
    record0.set(mobiHeader, docHeader.length);

    const pdbHeader = new Uint8Array(78);
    new DataView(pdbHeader.buffer).setUint16(76, 2);
    const recordList = new Uint8Array(2 * 8);
    const record0Offset = 78 + recordList.length;
    new DataView(recordList.buffer).setUint32(0, record0Offset);
    const record1Offset = record0Offset + record0.length;
    new DataView(recordList.buffer).setUint32(8, record1Offset);
    pdbHeader.set([0x42, 0x4f, 0x4f, 0x4b], 60); // 'BOOK'
    pdbHeader.set([0x4d, 0x4f, 0x42, 0x49], 64); // 'MOBI'

    const total = record1Offset + textBytes.length;
    const result = new Uint8Array(total);
    result.set(pdbHeader, 0);
    result.set(recordList, 78);
    result.set(record0, record0Offset);
    result.set(textBytes, record1Offset);
    return bytesToBase64(result);
  }
}
