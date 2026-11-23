import {
  SEGMENT_MAX_CHARS,
  normalizeWhitespace,
  segmentText,
  splitToSegments,
  toProgressPercent,
} from '../../../utils/text';

describe('文本分段（纯 JS）', () => {
  it('按中文句读边界切分', () => {
    const pieces = segmentText('第一句。第二句！第三句？第四句；结束。');
    expect(pieces).toEqual(['第一句。', '第二句！', '第三句？', '第四句；', '结束。']);
  });

  it('按英文标点与换行切分', () => {
    expect(segmentText('Hello world. How are you? Fine!\nNext line.')).toEqual([
      'Hello world.',
      'How are you?',
      'Fine!',
      'Next line.',
    ]);
  });

  it('超长无标点句按 800 字符硬切且每段长度受限', () => {
    const text = '啊'.repeat(2000);
    const pieces = segmentText(text);
    expect(pieces).toHaveLength(3);
    expect(pieces.map((piece) => piece.length)).toEqual([800, 800, 400]);
    pieces.forEach((piece) => expect(piece.length).toBeLessThanOrEqual(SEGMENT_MAX_CHARS));
  });

  it('混合中英文与超长句时保持边界与长度约束', () => {
    const text = `中文短句。${'a'.repeat(1000)}!尾句？`;
    const pieces = segmentText(text);
    expect(pieces[0]).toBe('中文短句。');
    expect(pieces[1]).toHaveLength(800);
    expect(pieces[2]).toHaveLength(201); // 200 个 a + 结尾的 '!' 边界符
    expect(pieces[pieces.length - 1]).toBe('尾句？');
  });

  it('空白归一与空文本', () => {
    expect(normalizeWhitespace('  a\t b\r\n c  ')).toBe('a b\n c');
    expect(segmentText('   \n\t ')).toEqual([]);
    expect(splitToSegments('你好。世界。')).toEqual([
      { index: 0, text: '你好。' },
      { index: 1, text: '世界。' },
    ]);
  });

  it('进度百分比保留 1 位小数并限制在 0..100', () => {
    expect(toProgressPercent(1, 3)).toBe(33.3);
    expect(toProgressPercent(20, 10)).toBe(100);
    expect(toProgressPercent(-5, 10)).toBe(0);
    expect(toProgressPercent(5, 0)).toBe(0);
  });
});
