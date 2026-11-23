/** 支持的电子书格式（EPUB 为 P0，MOBI/AZW/AZW3 为 P1 best-effort）。 */
export type BookFormat = 'epub' | 'mobi' | 'azw' | 'azw3';

/** 书籍元数据（来自 OPF metadata 或 MOBI 头部，缺失时使用文件名兜底）。 */
export interface BookMetadata {
  title: string;
  author?: string;
  language?: string;
  publisher?: string;
  identifier?: string;
}

/**
 * 章节：解析层的输出单元，同时供 WebView 渲染与 TTS 朗读。
 * index 采用 0-based；charCount 恒等于 text.length。
 */
export interface Chapter {
  id: string;
  index: number;
  title: string;
  href: string;
  html: string;
  text: string;
  charCount: number;
}

/** 完整书籍对象：仅在内存中存在，含正文；不整包写入 AsyncStorage。 */
export interface Book {
  id: string;
  format: BookFormat;
  metadata: BookMetadata;
  sourcePath: string;
  originFileName: string;
  fileSize: number;
  coverUri?: string;
  chapters: Chapter[];
  addedAt: number;
  lastOpenedAt: number;
}

/** 书架列表项：持久化到 AsyncStorage，不含正文，避免存储膨胀。 */
export interface BookSummary {
  id: string;
  title: string;
  author?: string;
  format: BookFormat;
  coverUri?: string;
  sourcePath: string;
  fileSize: number;
  chapterCount: number;
  addedAt: number;
  lastOpenedAt: number;
  progressPercent: number;
}
