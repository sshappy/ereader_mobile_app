import { create } from 'zustand';

import { NO_CHINESE_VOICE_MESSAGE } from '../constants/compliance';
import { ERROR_MESSAGES, ErrorCode } from '../constants/errorCodes';
import type {
  PlaybackState,
  TTSChannel,
  TTSConfig,
  TTSSegment,
  TtsHandlers,
  Voice,
} from '../types';
import { AppError, toUserMessage } from '../utils/errors';
import { logger } from '../utils/logger';
import { getTtsService } from './services';
import { useReaderStore } from './readerStore';
import { useSettingsStore } from './settingsStore';

export interface PendingPlayback {
  bookId: string;
  chapterIndex: number;
}

export interface TtsStoreState {
  /** 播放状态唯一来源；引擎只经 TtsHandlers 回调上报。 */
  state: PlaybackState;
  config: TTSConfig;
  segments: TTSSegment[];
  voices: Voice[];
  consentRequired: boolean;
  error: string | null;
  pending: PendingPlayback | null;
  start(bookId: string, chapterIndex: number): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  stop(): Promise<void>;
  switchChannel(channel: TTSChannel): Promise<void>;
  grantCloudConsent(): Promise<void>;
  rejectCloudConsent(): Promise<void>;
  loadVoices(): Promise<void>;
  clearError(): void;
}

const INITIAL_STATE: PlaybackState = {
  status: 'idle',
  chapterIndex: 0,
  segmentIndex: 0,
  channel: 'local',
};

const ttsService = getTtsService();

/**
 * 听书状态机：所有播放状态集中在此；切通道前由 TtsService.switchChannel 先 stop 旧引擎。
 * cloudConsent=false 时绝不调用云端引擎（引擎侧还有第二道门禁）。
 */
export const useTtsStore = create<TtsStoreState>()((set, get) => {
  let sessionId = 0;
  let speakChapter: (bookId: string, chapterIndex: number, session: number) => Promise<void>;

  const makeHandlers = (
    session: number,
    bookId: string,
    chapterIndex: number,
  ): TtsHandlers => ({
    onStateChange: (status) => {
      if (session !== sessionId) {
        return;
      }
      set((current) => ({ state: { ...current.state, status } }));
    },
    onBoundary: (segmentIndex, charOffset) => {
      if (session !== sessionId) {
        return;
      }
      set((current) => ({ state: { ...current.state, segmentIndex } }));
      const book = useReaderStore.getState().currentBook;
      if (book) {
        void useReaderStore
          .getState()
          .saveProgress({ chapterIndex, offset: charOffset });
      }
    },
    onChapterEnd: () => {
      if (session !== sessionId) {
        return;
      }
      const book = useReaderStore.getState().currentBook;
      const config = useSettingsStore.getState().settings.tts;
      const nextIndex = chapterIndex + 1;
      if (config.autoNextChapter && book && nextIndex < book.chapters.length) {
        set((current) => ({
          state: {
            ...current.state,
            status: 'loading',
            chapterIndex: nextIndex,
            segmentIndex: 0,
          },
        }));
        void speakChapter(book.id, nextIndex, session);
      } else {
        set((current) => ({ state: { ...current.state, status: 'stopped' } }));
      }
    },
    onError: (error) => {
      if (session !== sessionId) {
        return;
      }
      set((current) => ({
        state: {
          ...current.state,
          status: 'error',
          errorCode: error.code,
          message: error.toUserMessage(),
        },
        error: error.toUserMessage(),
      }));
    },
  });

  speakChapter = async (bookId, chapterIndex, session) => {
    const book = useReaderStore.getState().currentBook;
    const chapter = book?.chapters[chapterIndex];
    if (!book || !chapter) {
      set({ error: '章节不存在或书籍尚未打开' });
      return;
    }
    const config = useSettingsStore.getState().settings.tts;
    set({ config });

    if (config.channel === 'cloud' && !config.cloudConsent) {
      // 隐私门禁：不构造、不调用云端引擎，只请求 UI 展示告知弹窗。
      set({
        consentRequired: true,
        pending: { bookId, chapterIndex },
        state: {
          status: 'error',
          bookId,
          chapterIndex,
          segmentIndex: 0,
          channel: 'cloud',
          errorCode: ErrorCode.E_TTS_CONSENT_REQUIRED,
        },
      });
      return;
    }

    try {
      const engine = ttsService.getEngine(config.channel);
      await engine.prepare(config);
      const segments = ttsService.splitToSegments(chapter.text);
      if (session !== sessionId) {
        return;
      }
      set({
        segments,
        consentRequired: false,
        pending: null,
        state: {
          status: 'loading',
          bookId,
          chapterIndex,
          segmentIndex: 0,
          channel: config.channel,
          errorCode: undefined,
          message: undefined,
        },
      });
      const voiceId = config.channel === 'cloud' ? config.cloudVoiceId : config.localVoiceId;
      await engine.speak(
        { text: chapter.text, rate: config.rate, voiceId },
        makeHandlers(session, bookId, chapterIndex),
      );
    } catch (error) {
      if (session !== sessionId) {
        return;
      }
      const appError = error instanceof AppError ? error : new AppError(ErrorCode.E_TTS_SERVICE, toUserMessage(error));
      set((current) => ({
        error: appError.toUserMessage(),
        state: {
          ...current.state,
          status: 'error',
          errorCode: appError.code,
          message: appError.toUserMessage(),
        },
      }));
    }
  };

  return {
    state: { ...INITIAL_STATE },
    config: { ...useSettingsStore.getState().settings.tts },
    segments: [],
    voices: [],
    consentRequired: false,
    error: null,
    pending: null,

    start: async (bookId, chapterIndex) => {
      let book = useReaderStore.getState().currentBook;
      if (!book || book.id !== bookId) {
        book = await useReaderStore.getState().openBook(bookId);
      }
      if (!book || book.chapters.length === 0) {
        set({ error: '书籍不存在或暂无可读章节' });
        return;
      }
      const index = Math.max(0, Math.min(chapterIndex, book.chapters.length - 1));
      const config = useSettingsStore.getState().settings.tts;
      set({ config, error: null });

      // 隐私门禁前置：未同意云端时不得切换通道，也不得构造云端引擎/网络客户端。
      if (config.channel === 'cloud' && !config.cloudConsent) {
        sessionId += 1;
        set({
          consentRequired: true,
          pending: { bookId, chapterIndex: index },
          state: {
            ...get().state,
            status: 'error',
            bookId,
            chapterIndex: index,
            segmentIndex: 0,
            errorCode: ErrorCode.E_TTS_CONSENT_REQUIRED,
            message: ERROR_MESSAGES[ErrorCode.E_TTS_CONSENT_REQUIRED],
          },
        });
        return;
      }

      // 换章/重播时先终止当前引擎，避免同一通道内两次 speak 叠加出声。
      sessionId += 1;
      try {
        await ttsService.getEngine(get().state.channel).stop();
      } catch (error) {
        logger.debug('启动前停止旧引擎失败', error);
      }
      // 复用通道切换入口，跨通道时再次确保旧引擎已 stop。
      await ttsService.switchChannel(config.channel);
      await speakChapter(bookId, index, sessionId);
    },

    pause: async () => {
      const { state } = get();
      try {
        await ttsService.getEngine(state.channel).pause();
        set((current) => ({ state: { ...current.state, status: 'paused' } }));
      } catch (error) {
        set({ error: toUserMessage(error) });
      }
    },

    resume: async () => {
      const { state } = get();
      try {
        await ttsService.getEngine(state.channel).resume();
        set((current) => ({ state: { ...current.state, status: 'playing' } }));
      } catch (error) {
        set({ error: toUserMessage(error) });
      }
    },

    stop: async () => {
      sessionId += 1;
      const { state } = get();
      try {
        await ttsService.getEngine(state.channel).stop();
      } catch (error) {
        logger.warn('停止朗读失败', error);
      }
      set((current) => ({
        consentRequired: false,
        pending: null,
        state: { ...current.state, status: 'stopped', errorCode: undefined, message: undefined },
      }));
    },

    switchChannel: async (channel) => {
      const previous = get().state;
      // 播放页也可直接请求云端；同样前置门禁，避免未同意就构造网络客户端。
      if (channel === 'cloud' && !useSettingsStore.getState().settings.tts.cloudConsent) {
        set({
          consentRequired: true,
          pending: previous.bookId
            ? { bookId: previous.bookId, chapterIndex: previous.chapterIndex }
            : null,
          state: {
            ...previous,
            status: 'error',
            errorCode: ErrorCode.E_TTS_CONSENT_REQUIRED,
            message: ERROR_MESSAGES[ErrorCode.E_TTS_CONSENT_REQUIRED],
          },
        });
        return;
      }
      const shouldResume =
        previous.status === 'playing' ||
        previous.status === 'loading' ||
        previous.status === 'paused';
      try {
        // 关键：先 stop 旧引擎，避免本地与云端同时出声。
        await ttsService.switchChannel(channel);
        useSettingsStore.getState().setChannel(channel);
        const config = useSettingsStore.getState().settings.tts;
        set({
          config,
          consentRequired: false,
          state: {
            ...previous,
            channel,
            status: 'stopped',
            segmentIndex: 0,
            errorCode: undefined,
            message: undefined,
          },
        });
        if (shouldResume && previous.bookId !== undefined) {
          await get().start(previous.bookId, previous.chapterIndex);
        }
      } catch (error) {
        set({ error: toUserMessage(error) });
      }
    },

    grantCloudConsent: async () => {
      useSettingsStore.getState().grantCloudConsent();
      const pending = get().pending;
      set({ consentRequired: false, pending: null });
      if (!pending) {
        return;
      }
      sessionId += 1;
      // 同意后才允许构造云端引擎；先停止当时的通道引擎，避免双份出声。
      try {
        await ttsService.getEngine(get().state.channel).stop();
      } catch (error) {
        logger.debug('同意云端前停止旧引擎失败', error);
      }
      useSettingsStore.getState().setChannel('cloud');
      await ttsService.switchChannel('cloud');
      await speakChapter(pending.bookId, pending.chapterIndex, sessionId);
    },

    rejectCloudConsent: async () => {
      const pending = get().pending;
      useSettingsStore.getState().setChannel('local');
      set({ consentRequired: false, pending: null });
      await get().switchChannel('local');
      if (pending) {
        sessionId += 1;
        await speakChapter(pending.bookId, pending.chapterIndex, sessionId);
      }
    },

    loadVoices: async () => {
      const channel = get().state.channel;
      try {
        const voices = await ttsService.getEngine(channel).getVoices();
        set({ voices });
        if (
          channel === 'local' &&
          !voices.some((voice) => voice.language.toLowerCase().startsWith('zh'))
        ) {
          set({ error: NO_CHINESE_VOICE_MESSAGE });
        }
      } catch (error) {
        set({ voices: [], error: toUserMessage(error) });
      }
    },

    clearError: () => set({ error: null, state: { ...get().state, errorCode: undefined, message: undefined } }),
  };
});
