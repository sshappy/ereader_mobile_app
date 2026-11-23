import { create } from 'zustand';

import type { BookSummary } from '../types';
import { toUserMessage } from '../utils/errors';
import type { ILibraryService } from '../services/libraryService';
import type { PickedFile } from '../services/fileService';
import { getLibraryService } from './services';

// 注意：书目摘要的唯一持久化方是 LibraryService（key: ereader:v1:books）。
// 本 Store 不再用 zustand persist 写同一 key，否则会覆盖服务层写入的 BookSummary[]。

export interface LibraryStoreState {
  books: BookSummary[];
  loading: boolean;
  error: string | null;
  refresh(): Promise<void>;
  importBook(file: PickedFile): Promise<boolean>;
  deleteBook(id: string): Promise<void>;
  clearError(): void;
}

/** 可注入的工厂，便于组件测试用 mock ILibraryService 验证导入编排。 */
export function createLibraryStore(library: ILibraryService) {
  return create<LibraryStoreState>()((set, get) => ({
        books: [],
        loading: false,
        error: null,

        refresh: async () => {
          try {
            const books = await library.listBooks();
            set({ books, error: null });
          } catch (error) {
            set({ error: toUserMessage(error) });
          }
        },

        importBook: async (file) => {
          set({ loading: true, error: null });
          try {
            const result = await library.importFromPicked(file);
            if (!result.ok) {
              set({ error: result.message, loading: false });
              return false;
            }
            await get().refresh();
            set({ loading: false });
            return true;
          } catch (error) {
            set({ error: toUserMessage(error), loading: false });
            return false;
          }
        },

        deleteBook: async (id) => {
          set({ loading: true, error: null });
          try {
            await library.deleteBook(id);
            await get().refresh();
          } catch (error) {
            set({ error: toUserMessage(error) });
          } finally {
            set({ loading: false });
          }
        },

    clearError: () => set({ error: null }),
  }));
}

export type LibraryStoreApi = ReturnType<typeof createLibraryStore>;

/** 书架全局 Store。 */
export const useLibraryStore: LibraryStoreApi = createLibraryStore(getLibraryService());
