// 类型统一出口：业务代码一律从 '@/types' 导入，禁止深链引用。
export type {
  Book,
  BookFormat,
  BookMetadata,
  BookSummary,
  Chapter,
} from './book';
export type { ReadingProgress } from './progress';
export type {
  PlaybackState,
  PlaybackStatus,
  SpeakOptions,
  TTSChannel,
  TTSConfig,
  TTSSegment,
  TtsHandlers,
  Voice,
} from './tts';
export type {
  AppSettings,
  PageMode,
  ReaderSettings,
  Theme,
} from './settings';
