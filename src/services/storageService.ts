import AsyncStorage from '@react-native-async-storage/async-storage';

import { ErrorCode } from '../constants/errorCodes';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';

/** 本地键值持久化端口；只存书目摘要、进度与设置，禁止存 Chapter[]。 */
export interface IStorageService {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
  getAllKeys(): Promise<string[]>;
}

/** AsyncStorage 适配器：所有异常归一为 E_STORAGE_FAILED。 */
export class AsyncStorageService implements IStorageService {
  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await AsyncStorage.getItem(key);
      if (raw === null || raw === undefined) {
        return null;
      }
      return JSON.parse(raw) as T;
    } catch (error) {
      logger.warn('storage get failed', error);
      throw new AppError(ErrorCode.E_STORAGE_FAILED, '读取本地数据失败');
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    try {
      await AsyncStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      logger.warn('storage set failed', error);
      throw new AppError(ErrorCode.E_STORAGE_FAILED, '保存本地数据失败');
    }
  }

  async remove(key: string): Promise<void> {
    try {
      await AsyncStorage.removeItem(key);
    } catch (error) {
      logger.warn('storage remove failed', error);
      throw new AppError(ErrorCode.E_STORAGE_FAILED, '删除本地数据失败');
    }
  }

  async getAllKeys(): Promise<string[]> {
    try {
      return [...(await AsyncStorage.getAllKeys())];
    } catch (error) {
      logger.warn('storage getAllKeys failed', error);
      throw new AppError(ErrorCode.E_STORAGE_FAILED, '读取本地数据索引失败');
    }
  }
}

let defaultInstance: AsyncStorageService | null = null;

export function getStorageService(): IStorageService {
  if (defaultInstance === null) {
    defaultInstance = new AsyncStorageService();
  }
  return defaultInstance;
}
