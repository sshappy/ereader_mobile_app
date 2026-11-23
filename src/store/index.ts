// Store 统一出口：页面只从此处导入，避免深链引用。
export {
  createLibraryStore,
  useLibraryStore,
  type LibraryStoreApi,
  type LibraryStoreState,
} from './libraryStore';
export {
  useReaderStore,
  type ProgressPatch,
  type ReaderStoreState,
} from './readerStore';
export {
  useSettingsStore,
  DEFAULT_APP_SETTINGS,
  DEFAULT_READER_SETTINGS,
  DEFAULT_TTS_CONFIG,
  SETTINGS_VERSION,
  type SettingsStoreState,
} from './settingsStore';
export {
  useTtsStore,
  type PendingPlayback,
  type TtsStoreState,
} from './ttsStore';
