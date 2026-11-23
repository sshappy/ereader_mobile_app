import type { TTSSegment } from '../types';

/** 单段最大字符数（共享知识第 9 条）。 */
export const SEGMENT_MAX_CHARS = 800;

/** 句读边界：中英文句号/问号/叹号/分号与换行。 */
const BOUNDARY_CHARS = new Set(['。', '！', '？', '；', '.', '!', '?', ';', '\n']);

/** 空白归一：统一换行，压缩连续空格与制表符，保留段间空行。 */
export function normalizeWhitespace(text: string): string {
  return (text ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\t\f\v\u00a0]+/g, ' ')
    .replace(/ {2,}/g, ' ')
    .trim();
}

/**
 * 纯 JS 分段：优先在句读边界切分，超长句按 SEGMENT_MAX_CHARS 硬切。
 * 每段长度必 ≤ maxChars，分段索引从 0 开始。
 */
export function segmentText(text: string, maxChars: number = SEGMENT_MAX_CHARS): string[] {
  const normalized = normalizeWhitespace(text);
  if (normalized.length === 0) {
    return [];
  }
  const limit = Math.max(1, Math.floor(maxChars));
  const pieces: string[] = [];
  let buffer = '';
  // 边界后紧跟的空白（含换行）不另起一段，避免产生只有空白的朗读片段。
  let skipLeadingWhitespace = true;

  const emit = (): void => {
    const piece = buffer.replace(/^ +/, '');
    if (piece.length > 0) {
      pieces.push(piece);
    }
    buffer = '';
    skipLeadingWhitespace = true;
  };

  for (const char of normalized) {
    if (skipLeadingWhitespace && /\s/.test(char)) {
      continue;
    }
    skipLeadingWhitespace = false;
    buffer += char;
    if (BOUNDARY_CHARS.has(char) || buffer.length >= limit) {
      emit();
    }
  }
  emit();
  return pieces;
}

/** 生成带 0-based 索引的 TTS 分段（ITtsService.splitToSegments 的纯 JS 实现）。 */
export function splitToSegments(text: string): TTSSegment[] {
  return segmentText(text).map((piece, index) => ({ index, text: piece }));
}

/** 章内偏移换算为全书百分比，保留 1 位小数（0..100）。 */
export function toProgressPercent(
  completedChars: number,
  totalChars: number,
): number {
  if (totalChars <= 0) {
    return 0;
  }
  const percent = (Math.max(0, completedChars) / totalChars) * 100;
  return Math.round(Math.min(100, percent) * 10) / 10;
}
