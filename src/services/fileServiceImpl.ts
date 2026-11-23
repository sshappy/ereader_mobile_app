import RNFS from 'react-native-fs';
import DocumentPicker from 'react-native-document-picker';
import { PermissionsAndroid, Platform } from 'react-native';

import { ErrorCode } from '../constants/errorCodes';
import {
  BOOKS_DIR_NAME,
  TTS_CACHE_DIR_NAME,
  joinPath,
  safeFileName,
  baseName,
} from '../constants/paths';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';
import type { Base64, IFileService, PickedFile } from './fileService';

/**
 * 全工程唯一直接 import RNFS / DocumentPicker 的适配器。
 * 上层只依赖 IFileService；所有原生异常在此归一为 AppError。
 */
export class FileServiceImpl implements IFileService {
  private readonly booksDir: string;
  private readonly cacheDir: string;
  private dirsReady: Promise<void> | null = null;

  constructor() {
    this.booksDir = joinPath(RNFS.DocumentDirectoryPath, BOOKS_DIR_NAME);
    this.cacheDir = joinPath(RNFS.CachesDirectoryPath, TTS_CACHE_DIR_NAME);
  }

  getBooksDir(): string {
    return this.booksDir;
  }

  getCacheDir(): string {
    return this.cacheDir;
  }

  async pickEbook(): Promise<PickedFile | null> {
    try {
      const result = await DocumentPicker.pickSingle({
        type: [DocumentPicker.types.allFiles],
        copyTo: 'cachesDirectory',
      });
      const uri = result.fileCopyUri || result.uri;
      return {
        uri,
        name: baseName(result.name || uri),
        size: Number(result.size ?? 0),
      };
    } catch (error) {
      if (DocumentPicker.isCancel(error)) {
        return null;
      }
      logger.warn('pickEbook failed', error);
      throw new AppError(ErrorCode.E_FILE_READ_FAILED, '无法读取所选文件');
    }
  }

  async requestStoragePermission(): Promise<boolean> {
    if (Platform.OS !== 'android') {
      return true;
    }
    // Android 13+ 使用系统文件选择器（SAF），无需读取外部存储权限。
    const apiLevel = Number(Platform.Version);
    if (apiLevel >= 33) {
      return true;
    }
    try {
      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
        {
          title: '读取电子书文件',
          message: '需要存储权限才能读取您选择的电子书文件。',
          buttonNeutral: '稍后询问',
          buttonNegative: '取消',
          buttonPositive: '允许',
        },
      );
      return result === PermissionsAndroid.RESULTS.GRANTED;
    } catch (error) {
      logger.warn('requestStoragePermission failed', error);
      return false;
    }
  }

  async copyToPrivateDir(uri: string, name: string): Promise<string> {
    try {
      await this.ensureDirs();
      const safeName = `${Date.now()}-${safeFileName(name)}`;
      const destination = joinPath(this.booksDir, safeName);
      try {
        await RNFS.copyFile(uri, destination);
      } catch (copyError) {
        // content:// 等 URI 在部分 Android 版本不支持直接 copy，回退为 base64 读写。
        logger.debug('copyFile fallback to base64', copyError);
        const content = await RNFS.readFile(uri, 'base64');
        await RNFS.writeFile(destination, content, 'base64');
      }
      return destination;
    } catch (error) {
      throw new AppError(ErrorCode.E_FILE_READ_FAILED, '复制文件到应用私有目录失败');
    }
  }

  async readAsBase64(path: string): Promise<Base64> {
    try {
      return await RNFS.readFile(path, 'base64');
    } catch (error) {
      logger.warn('readAsBase64 failed', error);
      throw new AppError(ErrorCode.E_FILE_READ_FAILED, '读取文件内容失败');
    }
  }

  async writeCacheFile(name: string, base64: Base64): Promise<string> {
    try {
      await this.ensureDirs();
      const safeName = `${Date.now()}-${safeFileName(name)}`;
      const path = joinPath(this.cacheDir, safeName);
      await RNFS.writeFile(path, base64, 'base64');
      return `file://${path}`;
    } catch (error) {
      logger.warn('writeCacheFile failed', error);
      throw new AppError(ErrorCode.E_FILE_READ_FAILED, '写入音频缓存失败');
    }
  }

  async exists(path: string): Promise<boolean> {
    try {
      return await RNFS.exists(path);
    } catch (error) {
      logger.warn('exists failed', error);
      return false;
    }
  }

  async remove(path: string): Promise<void> {
    try {
      if (!path || path.startsWith('data:')) {
        return;
      }
      const normalized = path.replace(/^file:\/\//, '');
      if (await RNFS.exists(normalized)) {
        await RNFS.unlink(normalized);
      }
    } catch (error) {
      // 删除临时文件属于清理动作，失败只记录日志，不覆盖主流程错误。
      logger.warn('remove failed', error);
    }
  }

  /** 并发调用去重，避免多次 mkdir。 */
  private ensureDirs(): Promise<void> {
    if (this.dirsReady === null) {
      this.dirsReady = Promise.all([
        RNFS.mkdir(this.booksDir),
        RNFS.mkdir(this.cacheDir),
      ])
        .then(() => undefined)
        .catch((error) => {
          this.dirsReady = null;
          throw error;
        });
    }
    return this.dirsReady;
  }
}

let defaultInstance: FileServiceImpl | null = null;

/** 默认单例，供 T05 装配 Store 使用；测试请自行注入 IFileService mock。 */
export function getFileService(): IFileService {
  if (defaultInstance === null) {
    defaultInstance = new FileServiceImpl();
  }
  return defaultInstance;
}
