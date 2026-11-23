import type { StateStorage } from 'zustand/middleware';

import type { IStorageService } from '../services/storageService';

/**
 * 把已有 IStorageService 适配成 Zustand persist 所需的 StateStorage。
 * Store 不直接依赖 AsyncStorage，仍复用 ereader:v1: 前缀与统一错误归一化。
 */
export function createStateStorage(storage: IStorageService): StateStorage {
  return {
    getItem: async (name) => {
      const value = await storage.get<string>(name);
      return value ?? null;
    },
    setItem: async (name, value) => {
      await storage.set(name, value);
    },
    removeItem: async (name) => {
      await storage.remove(name);
    },
  };
}
