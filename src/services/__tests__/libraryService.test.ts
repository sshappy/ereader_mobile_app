import { ErrorCode } from '../../constants/errorCodes';
import { STORAGE_KEYS, progressKey } from '../../constants/storageKeys';
import type { Book, BookSummary } from '../../types';
import { AppError } from '../../utils/errors';
import type { IDrmGuard } from '../drmGuard';
import type { Base64, IFileService, PickedFile } from '../fileService';
import type { IBookParser, IBookParserFactory } from '../parser/bookParser';
import type { IStorageService } from '../storageService';
import { LibraryService } from '../libraryService';

function makeBook(id = 'book-1'): Book {
  return {
    id,
    format: 'epub',
    metadata: { title: '测试书' },
    sourcePath: '',
    originFileName: '',
    fileSize: 100,
    chapters: [
      {
        id: 'ch-0000',
        index: 0,
        title: '第一章',
        href: 'c1.xhtml',
        html: '<p>正文</p>',
        text: '正文',
        charCount: 2,
      },
    ],
    addedAt: 1000,
    lastOpenedAt: 1000,
  };
}

function makeSummary(book: Book): BookSummary {
  return {
    id: book.id,
    title: book.metadata.title,
    format: book.format,
    sourcePath: book.sourcePath,
    fileSize: book.fileSize,
    chapterCount: book.chapters.length,
    addedAt: book.addedAt,
    lastOpenedAt: book.lastOpenedAt,
    progressPercent: 0,
  };
}

class MemoryStorage implements IStorageService {
  readonly data = new Map<string, unknown>();

  async get<T>(key: string): Promise<T | null> {
    return (this.data.get(key) as T | undefined) ?? null;
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.data.set(key, value);
  }

  async remove(key: string): Promise<void> {
    this.data.delete(key);
  }

  async getAllKeys(): Promise<string[]> {
    return Array.from(this.data.keys());
  }
}

interface FileMock extends IFileService {
  copied: string[];
  removed: string[];
}

function makeFileService(base64Value: Base64 = 'ZHVtbXk='): FileMock {
  let counter = 0;
  return {
    copied: [],
    removed: [],
    async pickEbook() {
      return null;
    },
    async requestStoragePermission() {
      return true;
    },
    async copyToPrivateDir(_uri, name) {
      counter += 1;
      const path = `/private/books/${counter}-${name}`;
      this.copied.push(path);
      return path;
    },
    async readAsBase64() {
      return base64Value;
    },
    async writeCacheFile() {
      return 'file:///cache/audio.mp3';
    },
    async exists() {
      return true;
    },
    async remove(path) {
      this.removed.push(path);
    },
    getBooksDir() {
      return '/private/books';
    },
    getCacheDir() {
      return '/private/cache';
    },
  };
}

function makeDrmGuard(hasDrm = false): IDrmGuard {
  return {
    async detectEpub() {
      return { hasDrm, reason: hasDrm ? '测试 DRM' : undefined };
    },
    detectMobiFamily() {
      return { hasDrm };
    },
  };
}

function makeParserFactory(parser?: IBookParser): IBookParserFactory {
  const fallback: IBookParser = {
    format: 'epub',
    canHandle: () => true,
    async parse() {
      return makeBook();
    },
  };
  const selected = parser ?? fallback;
  return {
    create() {
      return selected;
    },
  };
}

const picked: PickedFile = { uri: 'content://sample.epub', name: 'sample.epub', size: 100 };

describe('LibraryService.importFromPicked', () => {
  it('成功导入：写摘要、进度并保留源文件', async () => {
    const fileService = makeFileService();
    const storage = new MemoryStorage();
    const service = new LibraryService({
      fileService,
      storage,
      drmGuard: makeDrmGuard(false),
      parserFactory: makeParserFactory(),
    });

    const result = await service.importFromPicked(picked);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.book.sourcePath).toBe('/private/books/1-sample.epub');
    expect(result.book.originFileName).toBe('sample.epub');
    expect(fileService.removed).toHaveLength(0);
    const summaries = await storage.get<BookSummary[]>(STORAGE_KEYS.BOOKS);
    expect(summaries).toHaveLength(1);
    expect(summaries?.[0].chapterCount).toBe(1);
    expect(await storage.get(progressKey(result.book.id))).toMatchObject({
      chapterIndex: 0,
      percent: 0,
    });
  });

  it('重复文件（同名同大小）直接拒绝且不复制', async () => {
    const fileService = makeFileService();
    const storage = new MemoryStorage();
    const existing = makeBook('old');
    existing.sourcePath = '/private/books/99-sample.epub';
    await storage.set(STORAGE_KEYS.BOOKS, [makeSummary(existing)]);
    const service = new LibraryService({
      fileService,
      storage,
      drmGuard: makeDrmGuard(false),
      parserFactory: makeParserFactory(),
    });

    const result = await service.importFromPicked(picked);
    expect(result).toMatchObject({ ok: false, code: ErrorCode.E_DUPLICATE_BOOK });
    expect(fileService.copied).toHaveLength(0);
  });

  it('DRM 命中：删除临时文件且不入书架', async () => {
    const fileService = makeFileService();
    const storage = new MemoryStorage();
    const service = new LibraryService({
      fileService,
      storage,
      drmGuard: makeDrmGuard(true),
      parserFactory: makeParserFactory(),
    });

    const result = await service.importFromPicked(picked);
    expect(result).toMatchObject({ ok: false, code: ErrorCode.E_DRM_DETECTED });
    expect(fileService.removed).toEqual(['/private/books/1-sample.epub']);
    expect(await storage.get(STORAGE_KEYS.BOOKS)).toBeNull();
  });

  it('解析失败：清理临时文件并返回可读错误', async () => {
    const fileService = makeFileService();
    const storage = new MemoryStorage();
    const failingParser: IBookParser = {
      format: 'epub',
      canHandle: () => true,
      async parse() {
        throw new AppError(ErrorCode.E_PARSE_FAILED, '坏文件');
      },
    };
    const service = new LibraryService({
      fileService,
      storage,
      drmGuard: makeDrmGuard(false),
      parserFactory: makeParserFactory(failingParser),
    });

    const result = await service.importFromPicked(picked);
    expect(result).toMatchObject({ ok: false, code: ErrorCode.E_PARSE_FAILED });
    expect(result.ok === false && result.message).toBe('坏文件');
    expect(fileService.removed).toHaveLength(1);
  });

  it('不支持的扩展名：返回 E_UNSUPPORTED_FORMAT', async () => {
    const service = new LibraryService({
      fileService: makeFileService(),
      storage: new MemoryStorage(),
      drmGuard: makeDrmGuard(false),
      parserFactory: makeParserFactory(),
    });
    const result = await service.importFromPicked({ ...picked, name: 'book.pdf' });
    expect(result).toMatchObject({ ok: false, code: ErrorCode.E_UNSUPPORTED_FORMAT });
  });

  it('删除书籍：移除源文件、进度与书架记录', async () => {
    const fileService = makeFileService();
    const storage = new MemoryStorage();
    const book = makeBook('target');
    book.sourcePath = '/private/books/1-sample.epub';
    await storage.set(STORAGE_KEYS.BOOKS, [makeSummary(book)]);
    await storage.set(progressKey('target'), { percent: 42 });
    const service = new LibraryService({
      fileService,
      storage,
      drmGuard: makeDrmGuard(false),
      parserFactory: makeParserFactory(),
    });

    await service.deleteBook('target');
    expect(fileService.removed).toContain('/private/books/1-sample.epub');
    expect(await storage.get(STORAGE_KEYS.BOOKS)).toEqual([]);
    expect(await storage.get(progressKey('target'))).toBeNull();
  });
});

describe('LibraryService.touchBook / loadBook', () => {
  function makeService(storage: MemoryStorage): LibraryService {
    return new LibraryService({
      fileService: makeFileService(),
      storage,
      drmGuard: makeDrmGuard(false),
      parserFactory: makeParserFactory(),
    });
  }

  async function seedBooks(storage: MemoryStorage): Promise<void> {
    const first = makeBook('A');
    first.sourcePath = '/private/books/1-a.epub';
    first.lastOpenedAt = 1000;
    const second = makeBook('B');
    second.sourcePath = '/private/books/2-b.epub';
    second.lastOpenedAt = 2000;
    // B 在前，模拟"最近打开 B"后的书架。
    await storage.set(STORAGE_KEYS.BOOKS, [makeSummary(first), makeSummary(second)]);
  }

  it('loadBook 刷新 lastOpenedAt，listBooks 按最近阅读置顶', async () => {
    const storage = new MemoryStorage();
    await seedBooks(storage);
    const service = makeService(storage);
    expect((await service.listBooks())[0].id).toBe('B');

    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(3000);
    try {
      await service.loadBook('A');
      const books = await service.listBooks();
      expect(books[0].id).toBe('A');
      expect(books[0].lastOpenedAt).toBe(3000);
    } finally {
      nowSpy.mockRestore();
    }
  });

  it('touchBook 更新 progressPercent 不丢 lastOpenedAt', async () => {
    const storage = new MemoryStorage();
    await seedBooks(storage);
    const service = makeService(storage);

    await service.touchBook('A', { progressPercent: 42 });

    const summaries = await storage.get<BookSummary[]>(STORAGE_KEYS.BOOKS);
    expect(summaries?.find((item) => item.id === 'A')).toMatchObject({
      progressPercent: 42,
      lastOpenedAt: 1000,
    });
  });

  it('并发 touchBook 串行合并，不覆盖彼此字段', async () => {
    const storage = new MemoryStorage();
    await seedBooks(storage);
    const service = makeService(storage);

    await Promise.all([
      service.touchBook('A', { lastOpenedAt: 3000 }),
      service.touchBook('A', { progressPercent: 55 }),
      service.touchBook('B', { progressPercent: 70 }),
    ]);

    const summaries = await storage.get<BookSummary[]>(STORAGE_KEYS.BOOKS);
    expect(summaries?.find((item) => item.id === 'A')).toMatchObject({
      lastOpenedAt: 3000,
      progressPercent: 55,
    });
    expect(summaries?.find((item) => item.id === 'B')).toMatchObject({
      lastOpenedAt: 2000,
      progressPercent: 70,
    });
  });
});
