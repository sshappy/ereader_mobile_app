import type { AppError } from '../utils/errors';

export type TTSChannel = 'local' | 'cloud';
export type PlaybackStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'stopped' | 'error';

export interface Voice {
  id: string;
  name: string;
  language: string;
  channel: TTSChannel;
}

/** 听书配置；cloudConsent 为 false 时禁止发起任何云端请求。 */
export interface TTSConfig {
  channel: TTSChannel;
  rate: number;
  localVoiceId?: string;
  cloudVoiceId: string;
  autoNextChapter: boolean;
  cloudConsent: boolean;
}

/** 章内文本分段：index 为 0-based，单段文本长度 ≤ SEGMENT_MAX_CHARS。 */
export interface TTSSegment {
  index: number;
  text: string;
  audioUri?: string;
  durationMs?: number;
}

/** 播放状态（UI 唯一来源是 TtsStore.state，引擎只通过回调上报）。 */
export interface PlaybackState {
  status: PlaybackStatus;
  bookId?: string;
  chapterIndex: number;
  segmentIndex: number;
  channel: TTSChannel;
  errorCode?: string;
  message?: string;
}

export interface SpeakOptions {
  text: string;
  voiceId?: string;
  rate: number;
}

/** 引擎向状态层上报事件的唯一通道。 */
export interface TtsHandlers {
  onStateChange?: (status: PlaybackStatus) => void;
  onBoundary?: (segmentIndex: number, charOffset: number) => void;
  onChapterEnd?: () => void;
  onError?: (error: AppError) => void;
}
