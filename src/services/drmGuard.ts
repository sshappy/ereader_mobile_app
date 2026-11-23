import JSZip from 'jszip';

import type { BookFormat } from '../types';
import { decodeBase64, readUInt16BE, readUInt32BE } from '../utils/base64';
import { logger } from '../utils/logger';
import type { Base64 } from './fileService';

export interface DrmCheckResult {
  hasDrm: boolean;
  reason?: string;
}

/**
 * DRM 门禁：只检测、只拒绝、只删除临时文件。
 * 本文件不包含、也不调用任何解密、密钥提取或绕过逻辑。
 */
export interface IDrmGuard {
  detectEpub(base64: Base64): Promise<DrmCheckResult>;
  detectMobiFamily(base64: Base64, format: BookFormat): DrmCheckResult;
}

export class DrmGuard implements IDrmGuard {
  /** EPUB：检测 META-INF/encryption.xml 中的 <EncryptedData> 与加密方法声明。 */
  async detectEpub(base64: Base64): Promise<DrmCheckResult> {
    let zip: JSZip;
    try {
      zip = await JSZip.loadAsync(base64, { base64: true });
    } catch (error) {
      // 坏 ZIP 由解析器归一为 E_PARSE_FAILED，DRM 门禁不因此拒绝。
      logger.debug('detectEpub: zip load failed', error);
      return { hasDrm: false };
    }

    const entryName = Object.keys(zip.files).find(
      (name) => name.toLowerCase() === 'meta-inf/encryption.xml',
    );
    if (!entryName) {
      return { hasDrm: false };
    }

    try {
      const xml = await zip.files[entryName].async('string');
      const hasEncryptedData = /<(?:[a-zA-Z0-9_-]+:)?EncryptedData\b/i.test(xml);
      const hasEncryptionMethod = /<(?:[a-zA-Z0-9_-]+:)?EncryptionMethod\b/i.test(xml);
      if (hasEncryptedData || hasEncryptionMethod) {
        return { hasDrm: true, reason: 'EPUB 包含加密条目（EncryptedData）' };
      }
      return { hasDrm: false };
    } catch (error) {
      logger.debug('detectEpub: read encryption.xml failed', error);
      return { hasDrm: false };
    }
  }

  /**
   * MOBI/AZW：best-effort 检测 PalmDOC 加密标志与 EXTH DRM 字段（104/109）。
   * 检测失败时保守返回"无 DRM"，由后续解析器给出格式不支持提示；绝不尝试解密。
   */
  detectMobiFamily(base64: Base64, format: BookFormat): DrmCheckResult {
    if (format === 'epub') {
      return { hasDrm: false };
    }
    let bytes: Uint8Array;
    try {
      bytes = decodeBase64(base64);
    } catch (error) {
      logger.debug('detectMobiFamily: invalid base64', error);
      return { hasDrm: false };
    }
    if (bytes.length < 96) {
      return { hasDrm: false };
    }

    const recordCount = readUInt16BE(bytes, 76);
    if (recordCount < 1 || bytes.length < 78 + recordCount * 8) {
      return { hasDrm: false };
    }

    // record 0 起始偏移（PalmDB 记录列表第一项）。
    const record0Offset = readUInt32BE(bytes, 78);
    const signature = String.fromCharCode(
      bytes[record0Offset + 16] ?? 0,
      bytes[record0Offset + 17] ?? 0,
      bytes[record0Offset + 18] ?? 0,
      bytes[record0Offset + 19] ?? 0,
    );
    if (signature !== 'MOBI') {
      // 老式 PalmDOC：encryption 字段位于 record 0 偏移 16。
      const encryption = readUInt16BE(bytes, record0Offset + 16);
      if (encryption !== 0) {
        return { hasDrm: true, reason: 'PalmDOC 加密标志非零' };
      }
    } else {
      // MOBI 头偏移 16/20 分别是 drm_offset / drm_count，非 0 即受保护。
      const drmOffset = readUInt32BE(bytes, record0Offset + 16 + 16);
      const drmCount = readUInt32BE(bytes, record0Offset + 16 + 20);
      if (drmOffset !== 0 || drmCount !== 0) {
        return { hasDrm: true, reason: 'MOBI DRM 字段非零' };
      }
    }

    // 在首条记录内扫描 EXTH 头；仅读取字段 id/长度/值，不做任何内容还原。
    const scanEnd = Math.min(bytes.length, Math.max(record0Offset + 16, record0Offset + 8192));
    for (let i = record0Offset + 16; i + 12 <= scanEnd; i += 1) {
      if (
        bytes[i] === 0x45 &&
        bytes[i + 1] === 0x58 &&
        bytes[i + 2] === 0x54 &&
        bytes[i + 3] === 0x48
      ) {
        const itemCount = readUInt32BE(bytes, i + 4);
        let cursor = i + 12;
        for (let item = 0; item < itemCount && cursor + 8 <= scanEnd; item += 1) {
          const id = readUInt32BE(bytes, cursor);
          const length = readUInt32BE(bytes, cursor + 4);
          if (length < 8 || cursor + length > scanEnd) {
            break;
          }
          if (id === 104 || id === 109) {
            let value = 0;
            for (let b = cursor + 8; b < cursor + length; b += 1) {
              value = (value * 256 + bytes[b]) >>> 0;
            }
            if (value !== 0) {
              return { hasDrm: true, reason: `MOBI EXTH DRM 字段 ${id} 非零` };
            }
          }
          cursor += length;
        }
        break;
      }
    }
    return { hasDrm: false };
  }
}
