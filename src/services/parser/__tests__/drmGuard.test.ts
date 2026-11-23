import JSZip from 'jszip';

import { bytesToBase64 } from '../../../utils/base64';
import { DrmGuard } from '../../drmGuard';
import { MobiParser } from '../mobiParser';

describe('DrmGuard.detectEpub', () => {
  it('检测到 EncryptedData 时返回 hasDrm', async () => {
    const zip = new JSZip();
    zip.file(
      'META-INF/encryption.xml',
      '<?xml version="1.0"?><encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container">' +
        '<enc:EncryptedData xmlns:enc="http://www.w3.org/2001/04/xmlenc#"><enc:CipherData/></enc:EncryptedData>' +
        '</encryption>',
    );
    const base64 = await zip.generateAsync({ type: 'base64' });
    const result = await new DrmGuard().detectEpub(base64);
    expect(result.hasDrm).toBe(true);
    expect(result.reason).toContain('EncryptedData');
  });

  it('无加密声明时返回 hasDrm=false', async () => {
    const zip = new JSZip();
    zip.file('META-INF/container.xml', '<container/>');
    const base64 = await zip.generateAsync({ type: 'base64' });
    await expect(new DrmGuard().detectEpub(base64)).resolves.toEqual({ hasDrm: false });
  });
});

describe('DrmGuard.detectMobiFamily', () => {
  function buildMobi(drmOffset: number, drmCount: number): string {
    const bytes = new Uint8Array(160);
    const view = new DataView(bytes.buffer);
    view.setUint16(76, 2); // 两条记录
    view.setUint32(78, 94); // record 0 偏移
    bytes.set([0x4d, 0x4f, 0x42, 0x49], 94 + 16); // 'MOBI'
    view.setUint32(94 + 16 + 16, drmOffset);
    view.setUint32(94 + 16 + 20, drmCount);
    return bytesToBase64(bytes);
  }

  it('MOBI DRM 字段非零时拒绝', () => {
    const result = new DrmGuard().detectMobiFamily(buildMobi(1024, 1), 'mobi');
    expect(result.hasDrm).toBe(true);
  });

  it('无 DRM 的样本正常解析（不被误判）', async () => {
    const base64 = buildMobi(0, 0);
    expect(new DrmGuard().detectMobiFamily(base64, 'mobi').hasDrm).toBe(false);
    const book = await new MobiParser('mobi').parse(base64, 'sample.mobi');
    expect(book.format).toBe('mobi');
  });
});
