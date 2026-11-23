import {
  htmlToText,
  sanitizeXhtml,
} from '../htmlToText';

describe('htmlToText', () => {
  it('提取正文并保留段落换行与实体解码', () => {
    const html =
      '<html><body><h1>标题</h1><p>第一段&nbsp;内容。</p><p>第二段 &amp; 更多。</p></body></html>';
    const text = htmlToText(html);
    expect(text).toContain('标题');
    expect(text).toContain('第一段 内容。');
    expect(text).toContain('第二段 & 更多。');
  });

  it('忽略 script/style 内容', () => {
    const html = '<body><script>alert("x")</script><style>p{color:red}</style><p>正文</p></body>';
    const text = htmlToText(html);
    expect(text).toBe('正文');
    expect(text).not.toContain('alert');
  });

  it('畸形 HTML 时回退为纯文本，不抛异常', () => {
    expect(() => htmlToText('<p>未闭合的段落 &bad')).not.toThrow();
    expect(htmlToText('<p>未闭合的段落 &bad')).toContain('未闭合的段落');
  });
});

describe('sanitizeXhtml', () => {
  it('移除脚本、事件属性与远程资源，保留 data URI 图片', () => {
    const html =
      '<body onclick="evil()"><script>alert(1)</script>' +
      '<a href="https://example.com" onclick="x()">外链</a>' +
      '<img src="https://example.com/a.png" alt="远程" />' +
      '<img src="data:image/png;base64,iVBORw0KGgo=" alt="封面" />' +
      '<p>正常正文</p></body>';
    const clean = sanitizeXhtml(html);
    expect(clean).not.toContain('<script');
    expect(clean).not.toContain('onclick');
    expect(clean).not.toContain('https://example.com');
    expect(clean).toContain('<p>正常正文</p>');
    expect(clean).toContain('data:image/png;base64,iVBORw0KGgo=');
  });
});
