import JSZip from 'jszip';

import type { Book, BookMetadata, Chapter } from '../../types';
import { ErrorCode } from '../../constants/errorCodes';
import { CONVERT_TO_EPUB_HINT } from '../../constants/compliance';
import { AppError } from '../../utils/errors';
import { simpleHash } from '../../utils/base64';
import { logger } from '../../utils/logger';
import type { Base64 } from '../fileService';
import type { IBookParser } from './bookParser';
import {
  attrOf,
  elementsNamed,
  firstNamed,
  htmlToText,
  parseDocument,
  sanitizeXhtml,
  textOf,
  type DomNode,
} from './htmlToText';

interface ManifestItem {
  id: string;
  href: string;
  mediaType: string;
  properties: string;
}

interface TocEntry {
  href: string;
  title: string;
}

/** EPUB 2/3 纯 JS 解析器：container.xml → OPF → NCX/nav → XHTML 正文与封面。 */
export class EpubParser implements IBookParser {
  readonly format = 'epub' as const;

  canHandle(fileName: string, base64: Base64): boolean {
    return fileName.toLowerCase().endsWith('.epub') && base64.trim().length > 0;
  }

  async parse(base64: Base64, fileName: string): Promise<Book> {
    try {
      const zip = await JSZip.loadAsync(base64, { base64: true });
      if (!zip) {
        throw new Error('空的 ZIP 容器');
      }

      const containerEntry = this.findEntry(zip, 'META-INF/container.xml');
      if (!containerEntry) {
        throw new Error('缺少 META-INF/container.xml');
      }
      const containerXml = await containerEntry.async('string');
      const containerDoc = parseDocument(containerXml, 'text/xml', true);
      const rootFile = firstNamed(containerDoc, 'rootfile');
      const opfPath = this.normalizePath(attrOf(rootFile, 'full-path'));
      if (!opfPath) {
        throw new Error('container.xml 未声明 OPF 路径');
      }

      const opfEntry = this.findEntry(zip, opfPath);
      if (!opfEntry) {
        throw new Error(`找不到 OPF 文件：${opfPath}`);
      }
      const opfXml = await opfEntry.async('string');
      const opfDoc = parseDocument(opfXml, 'text/xml', true);
      const metadata = this.readMetadata(opfDoc, fileName);
      const manifest = this.readManifest(opfDoc);
      const tocEntries = await this.readToc(zip, opfDoc, opfPath, manifest);
      const tocMap = new Map<string, string>();
      tocEntries.forEach((entry) => {
        if (!tocMap.has(entry.href)) {
          tocMap.set(entry.href, entry.title);
        }
      });

      const chapters = await this.readChapters(zip, opfDoc, opfPath, manifest, tocMap);
      if (chapters.length === 0) {
        throw new Error('OPF spine 中没有可解析的正文');
      }

      const coverUri = await this.readCover(zip, opfDoc, opfPath, manifest);
      const createdAt = Date.now();
      return {
        id: simpleHash(
          `${fileName}:${base64.length}:${base64.slice(0, 1024)}:${base64.slice(-1024)}`,
        ),
        format: 'epub',
        metadata,
        sourcePath: '',
        originFileName: fileName,
        fileSize: base64.length,
        coverUri,
        chapters,
        addedAt: createdAt,
        lastOpenedAt: createdAt,
      };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      const detail = error instanceof Error ? error.message : '未知错误';
      logger.warn('EPUB parse failed', detail);
      throw new AppError(
        ErrorCode.E_PARSE_FAILED,
        `EPUB 解析失败：${detail}。${CONVERT_TO_EPUB_HINT}`,
      );
    }
  }

  private readMetadata(opf: DomNode, fileName: string): BookMetadata {
    const title = textOf(firstNamed(opf, 'title')).trim();
    const author = textOf(firstNamed(opf, 'creator')).trim();
    const language = textOf(firstNamed(opf, 'language')).trim();
    const publisher = textOf(firstNamed(opf, 'publisher')).trim();
    const identifier = textOf(firstNamed(opf, 'identifier')).trim();
    return {
      title: title.length > 0 ? title : fileName.replace(/\.epub$/i, ''),
      author: author || undefined,
      language: language || undefined,
      publisher: publisher || undefined,
      identifier: identifier || undefined,
    };
  }

  private readManifest(opf: DomNode): Map<string, ManifestItem> {
    const items = new Map<string, ManifestItem>();
    elementsNamed(opf, 'item').forEach((node) => {
      const id = attrOf(node, 'id');
      const href = attrOf(node, 'href');
      if (!id || !href) {
        return;
      }
      items.set(id, {
        id,
        href,
        mediaType: attrOf(node, 'media-type').toLowerCase(),
        properties: attrOf(node, 'properties').toLowerCase(),
      });
    });
    return items;
  }

  /** NCX 优先；缺失或无有效条目时回退 EPUB3 nav 文档。 */
  private async readToc(
    zip: JSZip,
    opf: DomNode,
    opfPath: string,
    manifest: Map<string, ManifestItem>,
  ): Promise<TocEntry[]> {
    const ncxItem =
      Array.from(manifest.values()).find((item) => item.mediaType === 'application/x-dtbncx+xml') ??
      Array.from(manifest.values()).find((item) => item.id.toLowerCase() === 'ncx') ??
      Array.from(manifest.values()).find((item) => item.href.toLowerCase().endsWith('.ncx'));

    if (ncxItem) {
      const ncxPath = this.normalizePath(this.resolve(opfPath, ncxItem.href));
      const entry = this.findEntry(zip, ncxPath);
      if (entry) {
        try {
          const doc = parseDocument(await entry.async('string'), 'text/xml', true);
          const entries: TocEntry[] = elementsNamed(doc, 'navPoint').map((navPoint) => {
            const content = firstNamed(navPoint, 'content');
            const src = attrOf(content, 'src');
            return {
              href: this.normalizePath(this.resolve(ncxPath, src)),
              title: textOf(firstNamed(navPoint, 'text')).trim(),
            };
          });
          if (entries.some((item) => item.href.length > 0)) {
            return entries.filter((item) => item.href.length > 0);
          }
        } catch (error) {
          logger.debug('NCX parse failed, fallback to nav', error);
        }
      }
    }

    const navItem = Array.from(manifest.values()).find((item) =>
      item.properties.split(/\s+/).includes('nav'),
    );
    if (!navItem) {
      return [];
    }
    const navPath = this.normalizePath(this.resolve(opfPath, navItem.href));
    const navEntry = this.findEntry(zip, navPath);
    if (!navEntry) {
      return [];
    }
    try {
      const doc = parseDocument(await navEntry.async('string'), 'text/html', false);
      return elementsNamed(doc, 'a')
        .map((anchor) => ({
          href: this.normalizePath(this.resolve(navPath, attrOf(anchor, 'href'))),
          title: textOf(anchor).trim(),
        }))
        .filter((item) => item.href.length > 0);
    } catch (error) {
      logger.debug('nav parse failed', error);
      return [];
    }
  }

  private async readChapters(
    zip: JSZip,
    opf: DomNode,
    opfPath: string,
    manifest: Map<string, ManifestItem>,
    tocMap: Map<string, string>,
  ): Promise<Chapter[]> {
    const spine = firstNamed(opf, 'spine');
    const idrefs = elementsNamed(spine, 'itemref')
      .filter((node) => attrOf(node, 'linear').toLowerCase() !== 'no')
      .map((node) => attrOf(node, 'idref'));

    let candidates: ManifestItem[] = idrefs
      .map((idref) => manifest.get(idref))
      .filter((item): item is ManifestItem => Boolean(item));

    if (candidates.length === 0) {
      // spine 缺失时退化为按文件名排序的 XHTML 清单。
      candidates = Array.from(manifest.values())
        .filter((item) => /\.(xhtml|html|htm)$/i.test(item.href))
        .sort((left, right) => left.href.localeCompare(right.href));
    }

    const chapters: Chapter[] = [];
    for (const item of candidates) {
      if (!/\.(xhtml|html|htm|xml)$/i.test(item.href) && item.mediaType.length > 0) {
        continue;
      }
      const href = this.normalizePath(this.resolve(opfPath, item.href));
      const entry = this.findEntry(zip, href);
      if (!entry) {
        logger.debug('章节文件缺失，跳过', href);
        continue;
      }
      const raw = await entry.async('string');
      const doc = parseDocument(raw, 'text/html', false);
      const heading = firstNamed(doc, 'h1') ?? firstNamed(doc, 'h2') ?? firstNamed(doc, 'h3');
      const headingText = textOf(heading).trim();
      const index = chapters.length;
      const title = this.findTocTitle(tocMap, href) || headingText || `第 ${index + 1} 章`;
      const html = sanitizeXhtml(raw);
      const text = htmlToText(raw);
      chapters.push({
        id: `ch-${String(index).padStart(4, '0')}`,
        index,
        title,
        href,
        html,
        text,
        charCount: text.length,
      });
    }
    return chapters;
  }

  private async readCover(
    zip: JSZip,
    opf: DomNode,
    opfPath: string,
    manifest: Map<string, ManifestItem>,
  ): Promise<string | undefined> {
    let coverItem = Array.from(manifest.values()).find((item) =>
      item.properties.split(/\s+/).includes('cover-image'),
    );
    if (!coverItem) {
      const metaList = elementsNamed(opf, 'meta').filter(
        (node) => attrOf(node, 'name').toLowerCase() === 'cover',
      );
      for (const meta of metaList) {
        const id = attrOf(meta, 'content');
        if (manifest.has(id)) {
          coverItem = manifest.get(id);
          break;
        }
      }
    }
    if (!coverItem) {
      coverItem = Array.from(manifest.values()).find((item) =>
        /cover/i.test(item.href) && /image\//i.test(item.mediaType),
      );
    }
    if (!coverItem) {
      return undefined;
    }
    const coverPath = this.normalizePath(this.resolve(opfPath, coverItem.href));
    const entry = this.findEntry(zip, coverPath);
    if (!entry) {
      return undefined;
    }
    try {
      const base64 = await entry.async('base64');
      const mime = coverItem.mediaType.startsWith('image/')
        ? coverItem.mediaType
        : this.guessImageMime(coverPath);
      return `data:${mime};base64,${base64}`;
    } catch (error) {
      logger.debug('读取封面失败', error);
      return undefined;
    }
  }

  /** 目录 href 与正文路径写法不一致时，用文件名兜底匹配标题。 */
  private findTocTitle(tocMap: Map<string, string>, href: string): string {
    const exact = tocMap.get(href);
    if (exact) {
      return exact;
    }
    const fileName = href.split('/').pop() ?? href;
    for (const [key, title] of tocMap) {
      if ((key.split('/').pop() ?? key) === fileName) {
        return title;
      }
    }
    return '';
  }

  private guessImageMime(path: string): string {
    if (/\.png$/i.test(path)) return 'image/png';
    if (/\.gif$/i.test(path)) return 'image/gif';
    if (/\.webp$/i.test(path)) return 'image/webp';
    return 'image/jpeg';
  }

  /** 解析相对路径并处理 ./ 与 ../，返回 ZIP 内统一使用的正斜杠路径。 */
  private resolve(basePath: string, relative: string): string {
    const clean = (relative ?? '').split('#')[0].split('?')[0].replace(/^\/+/, '');
    if (!clean) {
      return '';
    }
    const dir = basePath.includes('/') ? basePath.slice(0, basePath.lastIndexOf('/')) : '';
    return `${dir ? `${dir}/` : ''}${clean}`.replace(/\/\.\//g, '/');
  }

  private normalizePath(path: string): string {
    const parts = (path ?? '').split('/');
    const stack: string[] = [];
    for (const part of parts) {
      if (!part || part === '.') {
        continue;
      }
      if (part === '..') {
        stack.pop();
      } else {
        stack.push(part);
      }
    }
    return stack.join('/');
  }

  /** ZIP 条目大小写/前缀差异兜底查找。 */
  private findEntry(zip: JSZip, path: string): JSZip.JSZipObject | null {
    if (!path) {
      return null;
    }
    const direct = zip.file(path);
    if (direct) {
      return direct;
    }
    const lower = path.toLowerCase();
    const key = Object.keys(zip.files).find(
      (name) => name.toLowerCase() === lower || name.toLowerCase().endsWith(`/${lower}`),
    );
    return key ? zip.files[key] : null;
  }
}
