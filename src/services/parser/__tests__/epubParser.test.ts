import JSZip from 'jszip';

import { ErrorCode } from '../../../constants/errorCodes';
import { AppError } from '../../../utils/errors';
import { EpubParser } from '../epubParser';

const CONTAINER = `<?xml version="1.0" encoding="UTF-8"?>
<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`;

const OPF_WITH_NCX = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" xmlns:dc="http://purl.org/dc/elements/1.1/" version="2.0" unique-identifier="bookid">
  <metadata>
    <dc:title>测试电子书</dc:title><dc:creator>测试作者</dc:creator>
    <dc:language>zh-CN</dc:language><dc:identifier id="bookid">test-id-001</dc:identifier>
    <meta name="cover" content="cover-img"/>
  </metadata>
  <manifest>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="c1" href="Text/c1.xhtml" media-type="application/xhtml+xml"/>
    <item id="c2" href="Text/c2.xhtml" media-type="application/xhtml+xml"/>
    <item id="cover-img" href="Images/cover.jpg" media-type="image/jpeg" properties="cover-image"/>
  </manifest>
  <spine toc="ncx"><itemref idref="c1"/><itemref idref="c2" linear="no"/><itemref idref="c2"/></spine>
</package>`;

const NCX = `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <navMap>
    <navPoint id="n1" playOrder="1"><navLabel><text>第一章 开始</text></navLabel><content src="Text/c1.xhtml"/></navPoint>
    <navPoint id="n2" playOrder="2"><navLabel><text>第二章 继续</text></navLabel><content src="Text/c2.xhtml"/></navPoint>
  </navMap>
</ncx>`;

const C1 = `<html xmlns="http://www.w3.org/1999/xhtml"><head><title>一</title></head><body>
<h1>第一章</h1><p>你好，世界。这是第一段。</p><script>alert(1)</script><p>这是第二段。</p></body></html>`;
const C2 = `<html xmlns="http://www.w3.org/1999/xhtml"><body><h1>第二章</h1><p>第二章正文。</p></body></html>`;

async function buildEpub(overrides: {
  opf?: string;
  toc?: string;
  includeContainer?: boolean;
  includeCover?: boolean;
} = {}): Promise<string> {
  const zip = new JSZip();
  if (overrides.includeContainer !== false) {
    zip.file('META-INF/container.xml', CONTAINER);
  }
  zip.file('OEBPS/content.opf', overrides.opf ?? OPF_WITH_NCX);
  zip.file('OEBPS/toc.ncx', overrides.toc ?? NCX);
  zip.file('OEBPS/Text/c1.xhtml', C1);
  zip.file('OEBPS/Text/c2.xhtml', C2);
  if (overrides.includeCover !== false) {
    zip.file('OEBPS/Images/cover.jpg', 'fake-jpeg-bytes', { base64: false });
  }
  return zip.generateAsync({ type: 'base64' });
}

describe('EpubParser', () => {
  it('按 spine 顺序解析目录、正文与章节索引（0-based）', async () => {
    const parser = new EpubParser();
    const base64 = await buildEpub();
    expect(parser.canHandle('book.epub', base64)).toBe(true);

    const book = await parser.parse(base64, 'book.epub');
    expect(book.format).toBe('epub');
    expect(book.metadata.title).toBe('测试电子书');
    expect(book.metadata.author).toBe('测试作者');
    expect(book.chapters).toHaveLength(2);
    expect(book.chapters.map((chapter) => chapter.title)).toEqual([
      '第一章 开始',
      '第二章 继续',
    ]);
    expect(book.chapters.map((chapter) => chapter.index)).toEqual([0, 1]);
    expect(book.chapters[0].href).toBe('OEBPS/Text/c1.xhtml');
    expect(book.chapters[0].text).toContain('你好，世界。这是第一段。');
    expect(book.chapters[0].charCount).toBe(book.chapters[0].text.length);
    expect(book.chapters[0].html).not.toContain('<script');
    expect(book.coverUri).toMatch(/^data:image\/jpeg;base64,/);
  });

  it('无 NCX 时回退 EPUB3 nav 文档', async () => {
    const opf = OPF_WITH_NCX
      .replace(/<item id="ncx"[^>]*\/>/, '')
      .replace(
        '<item id="c1"',
        '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="c1"',
      );
    const zip = new JSZip();
    zip.file('META-INF/container.xml', CONTAINER);
    zip.file('OEBPS/content.opf', opf);
    zip.file(
      'OEBPS/nav.xhtml',
      '<html xmlns="http://www.w3.org/1999/xhtml"><body><nav epub:type="toc"><ol>' +
        '<li><a href="Text/c1.xhtml">导航第一章</a></li>' +
        '<li><a href="Text/c2.xhtml">导航第二章</a></li>' +
        '</ol></nav></body></html>',
    );
    zip.file('OEBPS/Text/c1.xhtml', C1);
    zip.file('OEBPS/Text/c2.xhtml', C2);
    const base64 = await zip.generateAsync({ type: 'base64' });

    const book = await new EpubParser().parse(base64, 'nav.epub');
    expect(book.chapters.map((chapter) => chapter.title)).toEqual([
      '导航第一章',
      '导航第二章',
    ]);
  });

  it('坏 ZIP 与缺失 container.xml 均归一为 E_PARSE_FAILED', async () => {
    await expect(new EpubParser().parse('not-a-zip', 'bad.epub')).rejects.toMatchObject({
      code: ErrorCode.E_PARSE_FAILED,
    });
    const base64 = await buildEpub({ includeContainer: false });
    await expect(new EpubParser().parse(base64, 'no-container.epub')).rejects.toBeInstanceOf(
      AppError,
    );
  });
});
