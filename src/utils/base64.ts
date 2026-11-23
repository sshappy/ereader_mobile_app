/**
 * 纯 JS base64 / 二进制工具（不依赖 Buffer、atob 与任何 RN 模块）。
 * 供 DRM 检测、MOBI 解析与 Edge TTS 音频分片使用。
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const LOOKUP: Record<string, number> = {};
for (let index = 0; index < ALPHABET.length; index += 1) {
  LOOKUP[ALPHABET[index]] = index;
}

/** 解码 base64 字符串为字节数组；容忍 URL-safe 变体与空白字符。 */
export function decodeBase64(input: string): Uint8Array {
  const clean = (input ?? '')
    .replace(/[\r\n\s]/g, '')
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  if (clean.length === 0) {
    return new Uint8Array(0);
  }
  if (clean.length % 4 === 1 || !/^[A-Za-z0-9+/]*={0,2}$/.test(clean)) {
    throw new Error('非法 base64 数据');
  }

  const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  const byteLength = Math.floor((clean.length * 3) / 4) - padding;
  const bytes = new Uint8Array(byteLength);
  let byteIndex = 0;

  for (let i = 0; i < clean.length; i += 4) {
    const chunk = clean.slice(i, i + 4);
    const first = LOOKUP[chunk[0]];
    const second = LOOKUP[chunk[1]];
    const third = chunk[2] === '=' ? 0 : LOOKUP[chunk[2]];
    const fourth = chunk[3] === '=' ? 0 : LOOKUP[chunk[3]];
    if (first === undefined || second === undefined || third === undefined || fourth === undefined) {
      throw new Error('非法 base64 字符');
    }
    const bits = (first << 18) | (second << 12) | (third << 6) | fourth;
    if (byteIndex < byteLength) bytes[byteIndex++] = (bits >> 16) & 0xff;
    if (byteIndex < byteLength) bytes[byteIndex++] = (bits >> 8) & 0xff;
    if (byteIndex < byteLength) bytes[byteIndex++] = bits & 0xff;
  }
  return bytes;
}

/** 字节数组 → base64 字符串。 */
export function bytesToBase64(bytes: Uint8Array): string {
  let result = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const bits = (b0 << 16) | (b1 << 8) | b2;
    result += ALPHABET[(bits >> 18) & 0x3f];
    result += ALPHABET[(bits >> 12) & 0x3f];
    result += i + 1 < bytes.length ? ALPHABET[(bits >> 6) & 0x3f] : '=';
    result += i + 2 < bytes.length ? ALPHABET[bits & 0x3f] : '=';
  }
  return result;
}

/** 字节数组 → 二进制字符串（每个字节一个 charCode，用于拼接 mp3 分片）。 */
export function bytesToBinaryString(bytes: Uint8Array): string {
  let result = '';
  for (let i = 0; i < bytes.length; i += 1) {
    result += String.fromCharCode(bytes[i]);
  }
  return result;
}

/** 二进制字符串 → 字节数组。 */
export function binaryStringToBytes(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length);
  for (let i = 0; i < value.length; i += 1) {
    bytes[i] = value.charCodeAt(i) & 0xff;
  }
  return bytes;
}

/** 轻量非加密哈希：仅用于生成稳定书 ID，不用于任何安全用途。 */
export function simpleHash(input: string): string {
  let hash1 = 0x811c9dc5;
  let hash2 = 0x01000193;
  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i);
    hash1 = Math.imul(hash1 ^ code, 0x01000193) >>> 0;
    hash2 = Math.imul(hash2 + code + (hash2 << 5), 0x85ebca6b) >>> 0;
  }
  return `${hash1.toString(16).padStart(8, '0')}${hash2.toString(16).padStart(8, '0')}`;
}

/** 读取大端 uint16（DRM 标志与 PalmDB 头使用）。 */
export function readUInt16BE(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 2 > bytes.length) return 0;
  return (bytes[offset] << 8) | bytes[offset + 1];
}

/** 读取大端 uint32。 */
export function readUInt32BE(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 4 > bytes.length) return 0;
  return (
    ((bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3]) >>> 0
  );
}
