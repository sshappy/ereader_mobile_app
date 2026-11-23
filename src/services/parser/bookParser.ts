import type { Book, BookFormat } from '../../types';
import { ErrorCode } from '../../constants/errorCodes';
import { AppError } from '../../utils/errors';
import type { Base64 } from '../fileService';
import { EpubParser } from './epubParser';
import { MobiParser } from './mobiParser';

/** 书籍解析器端口：失败必须抛 AppError(E_PARSE_FAILED / E_DRM_DETECTED)。 */
export interface IBookParser {
  readonly format: BookFormat;
  canHandle(fileName: string, base64: Base64): boolean;
  parse(base64: Base64, fileName: string): Promise<Book>;
}

export interface IBookParserFactory {
  create(format: BookFormat): IBookParser;
}

/** 按格式创建解析器；EPUB 为 P0，其余格式走纯 JS best-effort。 */
export class BookParserFactory implements IBookParserFactory {
  create(format: BookFormat): IBookParser {
    switch (format) {
      case 'epub':
        return new EpubParser();
      case 'mobi':
      case 'azw':
      case 'azw3':
        return new MobiParser(format);
      default:
        throw new AppError(ErrorCode.E_UNSUPPORTED_FORMAT);
    }
  }
}

let defaultFactory: IBookParserFactory | null = null;

export function getBookParserFactory(): IBookParserFactory {
  if (defaultFactory === null) {
    defaultFactory = new BookParserFactory();
  }
  return defaultFactory;
}
