import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { STORAGE_KEYS } from '../constants/storageKeys';
import type { AppSettings, ReaderSettings, TTSChannel, TTSConfig } from '../types';
import { getAppStorage } from './services';
import { createStateStorage } from './storageAdapter';

export const SETTINGS_VERSION = 1;

export const DEFAULT_READER_SETTINGS: ReaderSettings = {
  fontSize: 18,
  lineHeight: 1.6,
  theme: 'light',
  pageMode: 'scroll',
};

export const DEFAULT_TTS_CONFIG: TTSConfig = {
  channel: 'local',
  rate: 1,
  localVoiceId: undefined,
  cloudVoiceId: 'zh-CN-XiaoxiaoNeural',
  autoNextChapter: false,
  cloudConsent: false,
};

export const DEFAULT_APP_SETTINGS: AppSettings = {
  reader: { ...DEFAULT_READER_SETTINGS },
  tts: { ...DEFAULT_TTS_CONFIG },
  complianceAccepted: false,
  version: SETTINGS_VERSION,
};

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

/** 独立同步两个共享 key，便于其他模块直接读取（结构升级时在此迁移）。 */
function syncLegacyKeys(settings: AppSettings): void {
  const storage = getAppStorage();
  void storage.set(STORAGE_KEYS.COMPLIANCE_ACCEPTED, settings.complianceAccepted).catch(() => undefined);
  void storage.set(STORAGE_KEYS.CLOUD_CONSENT, settings.tts.cloudConsent).catch(() => undefined);
}

export interface SettingsStoreState {
  settings: AppSettings;
  updateReader(patch: Partial<ReaderSettings>): void;
  setChannel(channel: TTSChannel): void;
  setRate(rate: number): void;
  setVoice(channel: TTSChannel, voiceId: string): void;
  setAutoNextChapter(enabled: boolean): void;
  grantCloudConsent(): void;
  revokeCloudConsent(): void;
  acceptCompliance(): void;
  reset(): void;
}

/** 应用设置：唯一持久化的是 settings（含阅读设置、TTS 配置与同意状态）。 */
export const useSettingsStore = create<SettingsStoreState>()(
  persist(
    (set) => ({
      settings: {
        ...DEFAULT_APP_SETTINGS,
        // 结构版本低于当前版本时用默认值补齐缺失字段（轻量迁移）。
        reader: { ...DEFAULT_READER_SETTINGS },
        tts: { ...DEFAULT_TTS_CONFIG },
      },

      updateReader: (patch) =>
        set((state) => {
          const reader: ReaderSettings = {
            fontSize: Math.round(clamp(patch.fontSize ?? state.settings.reader.fontSize, 14, 30)),
            lineHeight: clamp(patch.lineHeight ?? state.settings.reader.lineHeight, 1.2, 2),
            theme: patch.theme ?? state.settings.reader.theme,
            pageMode: patch.pageMode ?? state.settings.reader.pageMode,
          };
          const settings: AppSettings = { ...state.settings, reader };
          syncLegacyKeys(settings);
          return { settings };
        }),

      setChannel: (channel) =>
        set((state) => {
          const settings: AppSettings = {
            ...state.settings,
            tts: { ...state.settings.tts, channel },
          };
          syncLegacyKeys(settings);
          return { settings };
        }),

      setRate: (rate) =>
        set((state) => {
          const settings: AppSettings = {
            ...state.settings,
            tts: { ...state.settings.tts, rate: clamp(rate, 0.5, 2) },
          };
          return { settings };
        }),

      setVoice: (channel, voiceId) =>
        set((state) => {
          const tts: TTSConfig = { ...state.settings.tts };
          if (channel === 'cloud') {
            tts.cloudVoiceId = voiceId;
          } else {
            tts.localVoiceId = voiceId;
          }
          return { settings: { ...state.settings, tts } };
        }),

      setAutoNextChapter: (enabled) =>
        set((state) => ({
          settings: {
            ...state.settings,
            tts: { ...state.settings.tts, autoNextChapter: enabled },
          },
        })),

      grantCloudConsent: () =>
        set((state) => {
          const settings: AppSettings = {
            ...state.settings,
            tts: { ...state.settings.tts, cloudConsent: true },
          };
          syncLegacyKeys(settings);
          return { settings };
        }),

      revokeCloudConsent: () =>
        set((state) => {
          const settings: AppSettings = {
            ...state.settings,
            tts: { ...state.settings.tts, cloudConsent: false },
          };
          syncLegacyKeys(settings);
          return { settings };
        }),

      acceptCompliance: () =>
        set((state) => {
          const settings: AppSettings = { ...state.settings, complianceAccepted: true };
          syncLegacyKeys(settings);
          return { settings };
        }),

      reset: () => {
        syncLegacyKeys(DEFAULT_APP_SETTINGS);
        set({ settings: { ...DEFAULT_APP_SETTINGS } });
      },
    }),
    {
      name: STORAGE_KEYS.SETTINGS,
      version: SETTINGS_VERSION,
      storage: createJSONStorage(() => createStateStorage(getAppStorage())),
      // 白名单：仅设置，不含任何 Chapter[] 或运行时状态。
      partialize: (state) => ({ settings: state.settings }),
    },
  ),
);
