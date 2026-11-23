import type { BookSummary } from '../../types';
import type { ILibraryService, ImportResult } from '../../services/libraryService';
import type { PickedFile } from '../../services/fileService';
import { createLibraryStore } from '../../store/libraryStore';

/** 本机无模拟器：用 store/逻辑级冒烟测试覆盖 ShelfScreen 的导入与删除流程。 */
function makeSummary(): BookSummary {
  return {
    id: 'book-1',
    title: '测试书',
    format: 'epub',
    sourcePath: '/private/books/1-sample.epub',
    fileSize: 100,
    chapterCount: 2,
    addedAt: 1,
    lastOpenedAt: 1,
    progressPercent: 0,
  };
}

function makeService(importResult: ImportResult): ILibraryService {
  return {
    listBooks: jest.fn(async () => [makeSummary()]),
    importFromPicked: jest.fn(async () => importResult),
    loadBook: jest.fn(async () => {
      throw new Error('本测试不加载正文');
    }),
    touchBook: jest.fn(async () => undefined),
    deleteBook: jest.fn(async () => undefined),
  };
}

const file: PickedFile = { uri: 'content://sample.epub', name: 'sample.epub', size: 100 };

describe('书架导入流程（ShelfScreen 逻辑层）', () => {
  it('导入成功后立即刷新书架并清除 loading', async () => {
    const service = makeService({ ok: true, book: {} as never });
    const store = createLibraryStore(service);
    store.setState({ books: [], error: null, loading: false });

    const ok = await store.getState().importBook(file);

    expect(ok).toBe(true);
    expect(service.importFromPicked).toHaveBeenCalledWith(file);
    expect(store.getState().books).toHaveLength(1);
    expect(store.getState().loading).toBe(false);
    expect(store.getState().error).toBeNull();
  });

  it('DRM 拒绝时保留服务端可读错误且不刷新列表', async () => {
    const service = makeService({
      ok: false,
      code: 'E_DRM_DETECTED' as never,
      message: '该文件含有 DRM 保护，已拒绝导入',
    });
    const store = createLibraryStore(service);
    store.setState({ books: [], error: null, loading: false });

    const ok = await store.getState().importBook(file);

    expect(ok).toBe(false);
    expect(store.getState().error).toBe('该文件含有 DRM 保护，已拒绝导入');
    expect(store.getState().books).toHaveLength(0);
  });

  it('删除书籍后刷新书架', async () => {
    const service = makeService({ ok: true, book: {} as never });
    const store = createLibraryStore(service);
    store.setState({ books: [makeSummary()], error: null, loading: false });

    await store.getState().deleteBook('book-1');

    expect(service.deleteBook).toHaveBeenCalledWith('book-1');
    expect(store.getState().books).toHaveLength(1);
    expect(store.getState().loading).toBe(false);
  });
});
