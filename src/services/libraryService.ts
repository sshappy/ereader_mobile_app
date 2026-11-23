import type { Book, BookSummary, ReadingProgress } from '../types';
import { baseName } from '../constants/paths';
import { ERROR_MESSAGES, ErrorCode } from '../constants/errorCodes';
import { STORAGE_KEYS, progressKey } from '../constants/storageKeys';
import { AppError, asAppError } from '../utils/errors';
import { simpleHash } from '../utils/base64';
import { logger } from '../utils/logger';
import type { IDrmGuard } from './drmGuard';
import type { Base64, IFileService, PickedFile } from './fileService';
import { formatFromFileName } from './fileService';
import type { IBookParserFactory } from './parser/bookParser';
import type { IStorageService } from './storageService';

export type ImportResult =
  | { ok: true; book: Book }
  | { ok: false; code: ErrorCode; message: string };

export interface ILibraryService {
  importFromPicked(file: PickedFile): Promise<ImportResult>;
  listBooks(): Promise<BookSummary[]>;
  loadBook(id: string): Promise<Book>;
  /** 书目摘要的唯一写入口：串行读-改-写，避免并发覆盖 lastOpenedAt / progressPercent。 */
  touchBook(id: string, patch: Partial<BookSummary>): Promise<void>;
  deleteBook(id: string): Promise<void>;
}

export interface LibraryServiceDeps {
  fileService: IFileService;
  storage: IStorageService;
  drmGuard: IDrmGuard;
  parserFactory: IBookParserFactory;
}

/** 由"文件名 + 文件大小 + 内容哈希"生成稳定去重 ID。 */
export function createBookId(fileName: string, fileSize: number, base64: Base64): string {
  return simpleHash(
    `${fileName}:${fileSize}:${base64.slice(0, 2048)}:${base64.slice(-2048)}`,
  );
}

/** Book → BookSummary 投影：不携带 Chapter[]，避免 AsyncStorage 膨胀。 */
export function toSummary(book: Book): BookSummary {
  return {
    id: book.id,
    title: book.metadata.title,
    author: book.metadata.author,
    format: book.format,
    coverUri: book.coverUri,
    sourcePath: book.sourcePath,
    fileSize: book.fileSize,
    chapterCount: book.chapters.length,
    addedAt: book.addedAt,
    lastOpenedAt: book.lastOpenedAt,
    progressPercent: 0,
  };
}

function failure(code: ErrorCode, message?: string): ImportResult {
  return { ok: false, code, message: message ?? ERROR_MESSAGES[code] };
}

/** 兼容旧数据与带时间戳前缀的私有文件名。 */
function isSameOrigin(summary: BookSummary, file: PickedFile): boolean {
  const stored = baseName(summary.sourcePath);
  return (
    stored === file.name ||
    stored.endsWith(`-${file.name}`) ||
    summary.sourcePath.endsWith(`/${file.name}`)
  );
}

/**
 * 导入编排：按文件名+大小去重 → 复制私有目录 → DRM 门禁 → 解析 → 落库。
 * 任一失败都会删除已复制的临时文件，且返回可读 ImportResult 而非抛出。
 */
export class LibraryService implements ILibraryService {
  private readonly fileService: IFileService;
  private readonly storage: IStorageService;
  private readonly drmGuard: IDrmGuard;
  private readonly parserFactory: IBookParserFactory;
  /** 所有对该 key 的写入都经此队列串行执行。 */
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(deps: LibraryServiceDeps) {
    this.fileService = deps.fileService;
    this.storage = deps.storage;
    this.drmGuard = deps.drmGuard;
    this.parserFactory = deps.parserFactory;
  }

  async importFromPicked(file: PickedFile): Promise<ImportResult> {
    const format = formatFromFileName(file.name);
    if (!format) {
      return failure(ErrorCode.E_UNSUPPORTED_FORMAT);
    }

    let localPath = '';
    try {
      const summaries = await this.readSummaries();
      if (
        summaries.some(
          (item) => item.fileSize === file.size && isSameOrigin(item, file),
        )
      ) {
        return failure(ErrorCode.E_DUPLICATE_BOOK);
      }

      localPath = await this.fileService.copyToPrivateDir(file.uri, file.name);
      const base64 = await this.fileService.readAsBase64(localPath);
      const drmResult =
        format === 'epub'
          ? await this.drmGuard.detectEpub(base64)
          : this.drmGuard.detectMobiFamily(base64, format);

      if (drmResult.hasDrm) {
        await this.cleanup(localPath);
        localPath = '';
        const suffix = drmResult.reason ? `（${drmResult.reason}）` : '';
        return failure(
          ErrorCode.E_DRM_DETECTED,
          `${ERROR_MESSAGES[ErrorCode.E_DRM_DETECTED]}${suffix}`,
        );
      }

      const parser = this.parserFactory.create(format);
      if (!parser.canHandle(file.name, base64)) {
        throw new AppError(ErrorCode.E_PARSE_FAILED);
      }
      const book = await parser.parse(base64, file.name);
      book.id = createBookId(file.name, file.size, base64);
      book.sourcePath = localPath;
      book.originFileName = file.name;
      book.fileSize = file.size;

      const summary = toSummary(book);
      const progress: ReadingProgress = {
        bookId: book.id,
        chapterIndex: 0,
        chapterHref: book.chapters[0]?.href ?? '',
        offset: 0,
        chapterCount: book.chapters.length,
        percent: 0,
        updatedAt: Date.now(),
      };
      await this.storage.set(progressKey(book.id), progress);
      const next = [summary, ...summaries.filter((item) => item.id !== book.id)];
      await this.enqueueWrite(async () => {
        await this.storage.set(STORAGE_KEYS.BOOKS, next);
      });
      localPath = '';
      return { ok: true, book };
    } catch (error) {
      const appError = asAppError(error);
      if (localPath) {
        await this.cleanup(localPath);
      }
      logger.warn('导入失败', appError.code, appError.message);
      return failure(appError.code, appError.toUserMessage());
    }
  }

  async listBooks(): Promise<BookSummary[]> {
    const summaries = await this.readSummaries();
    return summaries.sort((left, right) => right.lastOpenedAt - left.lastOpenedAt);
  }

  async loadBook(id: string): Promise<Book> {
    const summaries = await this.readSummaries();
    const summary = summaries.find((item) => item.id === id);
    if (!summary) {
      throw new AppError(ErrorCode.E_FILE_READ_FAILED, '书籍不存在或已被删除');
    }
    const format = formatFromFileName(summary.sourcePath) ?? summary.format;
    const base64 = await this.fileService.readAsBase64(summary.sourcePath);
    const parser = this.parserFactory.create(format);
    const book = await parser.parse(base64, baseName(summary.sourcePath));
    book.id = summary.id;
    book.sourcePath = summary.sourcePath;
    book.originFileName = baseName(summary.sourcePath);
    book.fileSize = summary.fileSize;
    book.metadata.title = summary.title;
    book.metadata.author = summary.author;
    book.coverUri = summary.coverUri ?? book.coverUri;
    // 打开阅读即视为最近阅读，置顶由 listBooks 的 lastOpenedAt 降序保证。
    await this.touchBook(id, { lastOpenedAt: Date.now() });
    return book;
  }

  /**
   * 串行合并书目摘要补丁。patch 中忽略 id，防止误改主键；
   * 不存在的书 id 静默返回，避免打开已删除书籍时产生额外写入。
   */
  async touchBook(id: string, patch: Partial<BookSummary>): Promise<void> {
    await this.enqueueWrite(async () => {
      const summaries = await this.readSummaries();
      if (!summaries.some((item) => item.id === id)) {
        return;
      }
      const next = summaries.map((item) =>
        item.id === id ? { ...item, ...patch, id: item.id } : item,
      );
      await this.storage.set(STORAGE_KEYS.BOOKS, next);
    });
  }

  /** 把同一 key 的写操作排队，避免并发读-改-写相互覆盖。 */
  private enqueueWrite(task: () => Promise<void>): Promise<void> {
    const result = this.writeQueue.then(task);
    // 单个写入失败不应阻塞后续写入。
    this.writeQueue = result.catch(() => undefined);
    return result;
  }

  async deleteBook(id: string): Promise<void> {
    await this.enqueueWrite(async () => {
      const summaries = await this.readSummaries();
      const target = summaries.find((item) => item.id === id);
      if (!target) {
        return;
      }
      await this.fileService.remove(target.sourcePath);
      if (target.coverUri && target.coverUri.startsWith('file://')) {
        await this.fileService.remove(target.coverUri);
      }
      await this.storage.remove(progressKey(id));
      await this.storage.set(
        STORAGE_KEYS.BOOKS,
        summaries.filter((item) => item.id !== id),
      );
    });
  }

  private async readSummaries(): Promise<BookSummary[]> {
    try {
      const value = await this.storage.get<BookSummary[]>(STORAGE_KEYS.BOOKS);
      return Array.isArray(value) ? value : [];
    } catch (error) {
      throw asAppError(error, ErrorCode.E_STORAGE_FAILED);
    }
  }

  private async cleanup(path: string): Promise<void> {
    try {
      await this.fileService.remove(path);
    } catch (error) {
      logger.warn('清理临时文件失败', error);
    }
  }
}
