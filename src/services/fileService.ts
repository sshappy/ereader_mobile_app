import type { BookFormat } from '../types';
import { baseName } from '../constants/paths';

/** 文件选择器返回的原始文件描述。 */
export interface PickedFile {
  uri: string;
  name: string;
  size: number;
}

export type Base64 = string;

/** 统一文件/权限/选择器端口：除 fileServiceImpl 外禁止直接 import RNFS。 */
export interface IFileService {
  pickEbook(): Promise<PickedFile | null>;
  requestStoragePermission(): Promise<boolean>;
  copyToPrivateDir(uri: string, name: string): Promise<string>;
  readAsBase64(path: string): Promise<Base64>;
  writeCacheFile(name: string, base64: Base64): Promise<string>;
  exists(path: string): Promise<boolean>;
  remove(path: string): Promise<void>;
  getBooksDir(): string;
  getCacheDir(): string;
}

/** 按扩展名判定支持的电子书格式（纯 JS，供导入门禁与解析器复用）。 */
export function formatFromFileName(fileName: string): BookFormat | null {
  const name = baseName(fileName ?? '').toLowerCase();
  const dot = name.lastIndexOf('.');
  if (dot < 0 || dot === name.length - 1) {
    return null;
  }
  switch (name.slice(dot + 1)) {
    case 'epub':
      return 'epub';
    case 'mobi':
      return 'mobi';
    case 'azw':
      return 'azw';
    case 'azw3':
      return 'azw3';
    default:
      return null;
  }
}
