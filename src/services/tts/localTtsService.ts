import Tts from 'react-native-tts';

import type { SpeakOptions, TTSConfig, TtsHandlers, Voice } from '../../types';
import { NO_CHINESE_VOICE_MESSAGE } from '../../constants/compliance';
import { ErrorCode } from '../../constants/errorCodes';
import { AppError, asAppError } from '../../utils/errors';
import { logger } from '../../utils/logger';
import type { ITtsEngine } from './ttsService';

interface NativeVoice {
  id: string;
  name: string;
  language: string;
}

/** 系统 TTS 原生能力的最小接口，便于测试时注入 mock。 */
export interface TtsNativeAdapter {
  getVoices(): Promise<NativeVoice[]>;
  speak(text: string): Promise<void> | void;
  pause(): Promise<void> | void;
  resume(): Promise<void> | void;
  stop(): Promise<void> | void;
  setRate(rate: number): Promise<void> | void;
  setDefaultVoice(voiceId: string): Promise<void> | void;
  addEventListener(event: string, listener: (payload?: unknown) => void): void;
  removeEventListener(event: string, listener: (payload?: unknown) => void): void;
}

const defaultAdapter = Tts as unknown as TtsNativeAdapter;

/** 本地离线 TTS：系统合成，不上传任何文本。 */
export class LocalTtsService implements ITtsEngine {
  readonly channel = 'local' as const;

  private readonly native: TtsNativeAdapter;
  private config: TTSConfig | null = null;
  private finishListener: ((payload?: unknown) => void) | null = null;
  private errorListener: ((payload?: unknown) => void) | null = null;

  constructor(native: TtsNativeAdapter = defaultAdapter) {
    this.native = native;
  }

  async prepare(config: TTSConfig): Promise<void> {
    this.config = config;
    try {
      await this.native.setRate(config.rate);
      if (config.localVoiceId) {
        await this.native.setDefaultVoice(config.localVoiceId);
      }
    } catch (error) {
      throw asAppError(error, ErrorCode.E_TTS_SERVICE);
    }
  }

  async speak(options: SpeakOptions, handlers: TtsHandlers): Promise<void> {
    if (!options.text || options.text.trim().length === 0) {
      return;
    }
    this.detachListeners();
    try {
      await this.native.setRate(options.rate);
      if (options.voiceId || this.config?.localVoiceId) {
        await this.native.setDefaultVoice(options.voiceId ?? this.config?.localVoiceId ?? '');
      }
      handlers.onStateChange?.('loading');

      await new Promise<void>((resolve, reject) => {
        this.finishListener = () => resolve();
        this.errorListener = (payload: unknown) =>
          reject(asAppError(payload, ErrorCode.E_TTS_SERVICE));
        this.native.addEventListener('tts-finish', this.finishListener);
        this.native.addEventListener('tts-error', this.errorListener);
        handlers.onStateChange?.('playing');
        try {
          const result = this.native.speak(options.text);
          if (result && typeof (result as Promise<void>).then === 'function') {
            (result as Promise<void>).catch(reject);
          }
        } catch (error) {
          reject(asAppError(error, ErrorCode.E_TTS_SERVICE));
        }
      });

      handlers.onBoundary?.(0, options.text.length);
      handlers.onChapterEnd?.();
      handlers.onStateChange?.('stopped');
    } catch (error) {
      const appError = asAppError(error, ErrorCode.E_TTS_SERVICE);
      handlers.onStateChange?.('error');
      handlers.onError?.(appError);
    } finally {
      this.detachListeners();
    }
  }

  async pause(): Promise<void> {
    try {
      await this.native.pause();
    } catch (error) {
      throw asAppError(error, ErrorCode.E_TTS_SERVICE);
    }
  }

  async resume(): Promise<void> {
    try {
      await this.native.resume();
    } catch (error) {
      throw asAppError(error, ErrorCode.E_TTS_SERVICE);
    }
  }

  async stop(): Promise<void> {
    this.detachListeners();
    try {
      await this.native.stop();
    } catch (error) {
      logger.warn('本地 TTS 停止失败', error);
    }
  }

  async getVoices(): Promise<Voice[]> {
    let voices: NativeVoice[] = [];
    try {
      voices = await this.native.getVoices();
    } catch (error) {
      throw asAppError(error, ErrorCode.E_TTS_NO_VOICE);
    }
    if (!Array.isArray(voices) || voices.length === 0) {
      throw new AppError(ErrorCode.E_TTS_NO_VOICE, NO_CHINESE_VOICE_MESSAGE);
    }
    const mapped: Voice[] = voices.map((voice) => ({
      id: voice.id,
      name: voice.name || voice.id,
      language: voice.language || '',
      channel: 'local',
    }));
    if (!mapped.some((voice) => voice.language.toLowerCase().startsWith('zh'))) {
      logger.warn(NO_CHINESE_VOICE_MESSAGE);
    }
    return mapped;
  }

  async destroy(): Promise<void> {
    await this.stop();
    this.config = null;
  }

  private detachListeners(): void {
    if (this.finishListener) {
      this.native.removeEventListener('tts-finish', this.finishListener);
      this.finishListener = null;
    }
    if (this.errorListener) {
      this.native.removeEventListener('tts-error', this.errorListener);
      this.errorListener = null;
    }
  }
}
