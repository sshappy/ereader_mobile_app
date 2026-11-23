/** 阅读进度：章节索引为 0-based，percent 为全书百分比（0..100，保留 1 位小数）。 */
export interface ReadingProgress {
  bookId: string;
  chapterIndex: number;
  chapterHref: string;
  offset: number;
  chapterCount: number;
  percent: number;
  updatedAt: number;
}
