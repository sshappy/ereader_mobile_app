import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { STORAGE_KEYS, progressKey } from '../constants/storageKeys';
import type { Book, ReadingProgress } from '../types';
import { toProgressPercent } from '../utils/text';
import { toUserMessage } from '../utils/errors';
import { getAppStorage, getLibraryService } from './services';
import { createStateStorage } from './storageAdapter';

export interface ProgressPatch {
  chapterIndex?: number;
  offset?: number;
  percent?: number;
}

export interface ReaderStoreState {
  currentBook: Book | null;
  progress: ReadingProgress | null;
  loading: boolean;
  error: string | null;
  openBook(id: string): Promise<Book | null>;
  closeBook(): void;
  jumpToChapter(index: number): Promise<void>;
  saveProgress(patch: ProgressPatch): Promise<void>;
  clearError(): void;
}

function initialProgress(book: Book): ReadingProgress {
  return {
    bookId: book.id,
    chapterIndex: 0,
    chapterHref: book.chapters[0]?.href ?? '',
    offset: 0,
    chapterCount: book.chapters.length,
    percent: 0,
    updatedAt: Date.now(),
  };
}

/** 全书已读字符数 = 前序章节总字数 + 当前章内偏移。 */
function completedChars(book: Book, chapterIndex: number, offset: number): number {
  let completed = 0;
  for (let i = 0; i < Math.min(chapterIndex, book.chapters.length); i += 1) {
    completed += book.chapters[i].charCount;
  }
  const chapter = book.chapters[chapterIndex];
  const safeOffset = Math.max(0, Math.min(offset, chapter?.charCount ?? offset));
  return completed + safeOffset;
}

function totalChars(book: Book): number {
  return book.chapters.reduce((sum, chapter) => sum + chapter.charCount, 0);
}

/** 当前书与进度；Chapter[] 只在内存，持久化仅 progress 与书架摘要百分比。 */
export const useReaderStore = create<ReaderStoreState>()(
  persist(
    (set, get) => ({
      currentBook: null,
      progress: null,
      loading: false,
      error: null,

      openBook: async (id) => {
        set({ loading: true, error: null });
        try {
          const book = await getLibraryService().loadBook(id);
          const stored = await getAppStorage().get<ReadingProgress>(progressKey(id));
          const progress: ReadingProgress =
            stored && stored.chapterIndex < book.chapters.length
              ? { ...stored, bookId: id, chapterCount: book.chapters.length }
              : initialProgress(book);
          set({ currentBook: book, progress, loading: false });
          return book;
        } catch (error) {
          set({ loading: false, error: toUserMessage(error) });
          return null;
        }
      },

      closeBook: () => set({ currentBook: null, progress: null }),

      jumpToChapter: async (index) => {
        const { currentBook, progress } = get();
        if (!currentBook || index < 0 || index >= currentBook.chapters.length) {
          return;
        }
        const offset = 0;
        const chapter = currentBook.chapters[index];
        const percent = toProgressPercent(
          completedChars(currentBook, index, offset),
          totalChars(currentBook),
        );
        const next: ReadingProgress = {
          bookId: currentBook.id,
          chapterIndex: index,
          chapterHref: chapter.href,
          offset,
          chapterCount: currentBook.chapters.length,
          percent,
          updatedAt: Date.now(),
        };
        set({ progress: next });
        await getAppStorage().set(progressKey(currentBook.id), next);
      },

      saveProgress: async (patch) => {
        const { currentBook, progress } = get();
        if (!currentBook || !progress) {
          return;
        }
        const chapterIndex =
          patch.chapterIndex !== undefined
            ? Math.max(0, Math.min(patch.chapterIndex, currentBook.chapters.length - 1))
            : progress.chapterIndex;
        const offset = patch.offset !== undefined ? patch.offset : progress.offset;
        const chapter = currentBook.chapters[chapterIndex];
        const percent =
          patch.percent !== undefined
            ? patch.percent
            : toProgressPercent(
                completedChars(currentBook, chapterIndex, offset),
                totalChars(currentBook),
              );
        const next: ReadingProgress = {
          bookId: currentBook.id,
          chapterIndex,
          chapterHref: chapter?.href ?? progress.chapterHref,
          offset: Math.max(0, Math.min(offset, chapter?.charCount ?? offset)),
          chapterCount: currentBook.chapters.length,
          percent: Math.round(Math.min(100, Math.max(0, percent)) * 10) / 10,
          updatedAt: Date.now(),
        };
        set({ progress: next });

        // 书目摘要由 LibraryService.touchBook 唯一写入（串行合并），此处不再直写 books key。
        try {
          await getLibraryService().touchBook(currentBook.id, {
            progressPercent: next.percent,
          });
          await getAppStorage().set(progressKey(currentBook.id), next);
        } catch (error) {
          set({ error: toUserMessage(error) });
        }
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: `${STORAGE_KEYS.BOOKS}:readerState`,
      storage: createJSONStorage(() => createStateStorage(getAppStorage())),
      partialize: (state) => ({ progress: state.progress }),
    },
  ),
);
