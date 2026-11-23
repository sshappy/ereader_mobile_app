import { DOMParser } from '@xmldom/xmldom';

/**
 * XHTML → 纯文本 / 渲染前净化。纯 JS 实现，不 import 任何 RN 模块。
 * 解析与渲染解耦：解析器只产出已剥离脚本与远程资源的 HTML 片段。
 */

export interface DomNodeList {
  length: number;
  item(index: number): DomNode | null;
  [index: number]: DomNode;
}

export interface DomNode {
  nodeType: number;
  nodeName: string;
  nodeValue: string | null;
  childNodes: DomNodeList;
  attributes?: { length: number; item(index: number): { name: string; value: string } | null } | null;
  getAttribute?(name: string): string | null;
}

const HTML_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  laquo: '«',
  raquo: '»',
  middot: '·',
  copy: '©',
  reg: '®',
};

/** 解码常见 HTML 实体与数字实体（xmldom 对部分实体不自动展开）。 */
export function decodeEntities(value: string): string {
  return (value ?? '').replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (full, entity: string) => {
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      const code = Number.parseInt(entity.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : full;
    }
    if (entity.startsWith('#')) {
      const code = Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : full;
    }
    return HTML_ENTITIES[entity] ?? full;
  });
}

/** 解析 XML/HTML；strict=true 时语法错误抛异常，由调用方转 AppError。 */
export function parseDocument(
  source: string,
  mime: 'text/xml' | 'text/html' = 'text/xml',
  strict = false,
): DomNode {
  // @xmldom/xmldom 0.9 起 errorHandler 对象已废弃，统一使用 onError(level, msg, context)。
  // 预注册 EPUB 常见前缀：部分 XHTML 用了 epub:type 却未声明 xmlns:epub，
  // xmldom 会抛 NamespaceError，这里补齐映射以提升兼容性。
  const parser = new DOMParser({
    onError: (level, message) => {
      if (strict && level !== 'warning') {
        throw new Error(message);
      }
    },
    xmlns: {
      epub: 'http://www.idpf.org/2007/ops',
      dc: 'http://purl.org/dc/elements/1.1/',
      opf: 'http://www.idpf.org/2007/opf',
      ncx: 'http://www.daisy.org/z3986/2005/ncx/',
      xhtml: 'http://www.w3.org/1999/xhtml',
      xml: 'http://www.w3.org/XML/1998/namespace',
    },
  });
  return parser.parseFromString(source ?? '', mime) as unknown as DomNode;
}

export function childNodesOf(node: DomNode | null | undefined): DomNode[] {
  if (!node || !node.childNodes) {
    return [];
  }
  const result: DomNode[] = [];
  for (let i = 0; i < node.childNodes.length; i += 1) {
    const child = node.childNodes.item(i) ?? node.childNodes[i];
    if (child) {
      result.push(child);
    }
  }
  return result;
}

/** 深度优先遍历所有节点（含文本）。 */
export function descendantsOf(node: DomNode | null | undefined): DomNode[] {
  const result: DomNode[] = [];
  const walk = (current: DomNode): void => {
    result.push(current);
    childNodesOf(current).forEach(walk);
  };
  if (node) {
    walk(node);
  }
  return result;
}

/** 按标签本地名查找元素（忽略命名空间前缀）。 */
export function elementsNamed(node: DomNode | null | undefined, name: string): DomNode[] {
  const target = name.toLowerCase();
  return descendantsOf(node).filter(
    (item) =>
      item.nodeType === 1 &&
      (item.nodeName.split(':').pop() ?? item.nodeName).toLowerCase() === target,
  );
}

export function firstNamed(node: DomNode | null | undefined, name: string): DomNode | null {
  return elementsNamed(node, name)[0] ?? null;
}

/** 读取属性（忽略命名空间前缀）。 */
export function attrOf(node: DomNode | null | undefined, name: string): string {
  if (!node) {
    return '';
  }
  const target = name.toLowerCase();
  if (node.getAttribute) {
    const direct = node.getAttribute(name);
    if (direct) {
      return direct;
    }
  }
  const attrs = node.attributes;
  if (!attrs) {
    return '';
  }
  for (let i = 0; i < attrs.length; i += 1) {
    const attr = attrs.item(i);
    if (attr && (attr.name.split(':').pop() ?? attr.name).toLowerCase() === target) {
      return attr.value ?? '';
    }
  }
  return '';
}

/** 取元素及其子树的纯文本。 */
export function textOf(node: DomNode | null | undefined): string {
  if (!node) {
    return '';
  }
  if (node.nodeType === 3) {
    return decodeEntities(node.nodeValue ?? '');
  }
  return childNodesOf(node).map(textOf).join('');
}

const BLOCKED_TAGS = new Set([
  'script',
  'style',
  'noscript',
  'iframe',
  'object',
  'embed',
  'link',
  'meta',
  'base',
  'form',
  'input',
  'button',
  'svg',
  'audio',
  'video',
  'source',
]);

const VOID_TAGS = new Set(['br', 'hr', 'img']);

const BLOCK_TAGS = new Set([
  'p',
  'div',
  'br',
  'hr',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'li',
  'ul',
  'ol',
  'tr',
  'table',
  'blockquote',
  'section',
  'article',
  'pre',
]);

function localName(node: DomNode): string {
  return (node.nodeName.split(':').pop() ?? node.nodeName).toLowerCase();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 只允许相对锚点与 data URI；任何 http(s)/协议相对外链都被移除。 */
function isSafeUri(value: string, imageOnly: boolean): boolean {
  const clean = decodeEntities(value).trim();
  if (clean.startsWith('#')) {
    return !imageOnly;
  }
  if (imageOnly) {
    return /^data:image\/(png|jpeg|jpg|gif|webp);base64,[a-z0-9+/=]+$/i.test(clean);
  }
  return clean.length === 0;
}

function serializeNode(node: DomNode): string {
  if (node.nodeType === 3) {
    return escapeHtml(decodeEntities(node.nodeValue ?? ''));
  }
  if (node.nodeType !== 1) {
    return '';
  }
  const tag = localName(node);
  if (BLOCKED_TAGS.has(tag)) {
    return '';
  }

  const attrs: string[] = [];
  const rawClass = attrOf(node, 'class');
  const rawId = attrOf(node, 'id');
  const rawAlt = attrOf(node, 'alt');
  if (rawClass) attrs.push(` class="${escapeHtml(rawClass.slice(0, 120))}"`);
  if (rawId) attrs.push(` id="${escapeHtml(rawId.slice(0, 120))}"`);
  if (rawAlt) attrs.push(` alt="${escapeHtml(rawAlt.slice(0, 200))}"`);
  if (tag === 'a') {
    const href = attrOf(node, 'href');
    if (isSafeUri(href, false)) {
      attrs.push(` href="${escapeHtml(href)}"`);
    }
  }
  if (tag === 'img') {
    const src = attrOf(node, 'src');
    if (isSafeUri(src, true)) {
      attrs.push(` src="${src}"`);
    }
  }

  const inner = childNodesOf(node).map(serializeNode).join('');
  if (VOID_TAGS.has(tag)) {
    return `<${tag}${attrs.join('')} />`;
  }
  return `<${tag}${attrs.join('')}>${inner}</${tag}>`;
}

/**
 * 渲染前净化：去脚本/样式/外链，事件属性与 style 一律丢弃，
 * 图片仅保留 data URI。返回可直接交给 WebView 的 HTML 片段。
 */
export function sanitizeXhtml(xhtml: string): string {
  if (!xhtml || xhtml.trim().length === 0) {
    return '';
  }
  try {
    const doc = parseDocument(xhtml, 'text/html', false);
    const body = firstNamed(doc, 'body') ?? firstNamed(doc, 'html') ?? doc;
    return childNodesOf(body).map(serializeNode).join('').trim();
  } catch (error) {
    // 极端畸形输入时退化为"只保留纯文本"，绝不把原始脚本交给 WebView。
    const plain = fallbackToText(xhtml);
    return `<p>${escapeHtml(plain)}</p>`;
  }
}

function collectText(node: DomNode): string {
  if (node.nodeType === 3) {
    return decodeEntities(node.nodeValue ?? '');
  }
  if (node.nodeType !== 1) {
    return '';
  }
  const tag = localName(node);
  if (BLOCKED_TAGS.has(tag)) {
    return '';
  }
  let text = childNodesOf(node).map(collectText).join('');
  if (BLOCK_TAGS.has(tag)) {
    text += '\n';
  }
  return text;
}

function normalizeText(value: string): string {
  return value
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function fallbackToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|noscript)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<\s*br\s*\/?\s*>/gi, '\n')
      .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  );
}

/** XHTML → 纯正文（供 TTS 与搜索），保留段落换行。 */
export function htmlToText(xhtml: string): string {
  if (!xhtml || xhtml.trim().length === 0) {
    return '';
  }
  try {
    const doc = parseDocument(xhtml, 'text/html', false);
    const body = firstNamed(doc, 'body') ?? firstNamed(doc, 'html') ?? doc;
    const text = normalizeText(collectText(body));
    return text.length > 0 ? text : normalizeText(fallbackToText(xhtml));
  } catch (error) {
    return normalizeText(fallbackToText(xhtml));
  }
}
