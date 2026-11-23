import Sound from 'react-native-sound';

import { ErrorCode } from '../../constants/errorCodes';
import { AppError, asAppError } from '../../utils/errors';
import { logger } from '../../utils/logger';

/** 原生播放器最小接口，测试可注入 mock 实现。 */
export interface SoundLike {
  setVolume(value: number): void;
  setRate(value: number): void;
  play(callback: (error?: unknown) => void): void;
  pause(): void;
  resume(): void;
  stop(callback?: () => void): void;
  release(): void;
}

export interface IAudioPlayer {
  play(uri: string, onEnd: () => void, onError: (error: AppError) => void): Promise<void>;
  pause(): void;
  resume(): void;
  stop(): void;
  setRate(rate: number): void;
}

export type SoundFactory = (uri: string) => SoundLike;

const defaultFactory: SoundFactory = (uri: string): SoundLike => {
  const path = uri.replace(/^file:\/\//, '');
  return new Sound(path, undefined) as unknown as SoundLike;
};

/** react-native-sound 适配器：按 URI 顺序播放本地 mp3 分片。 */
export class AudioPlayerService implements IAudioPlayer {
  private readonly createSound: SoundFactory;
  private current: SoundLike | null = null;
  private rate = 1;

  constructor(factory: SoundFactory = defaultFactory) {
    this.createSound = factory;
  }

  async play(
    uri: string,
    onEnd: () => void,
    onError: (error: AppError) => void,
  ): Promise<void> {
    this.stop();
    try {
      Sound.setCategory('Playback', true);
      const sound = this.createSound(uri);
      this.current = sound;
      sound.setVolume(1);
      sound.setRate(this.rate);
      sound.play((error?: unknown) => {
        if (error) {
          onError(asAppError(error, ErrorCode.E_TTS_SERVICE));
          return;
        }
        onEnd();
      });
    } catch (error) {
      const appError = asAppError(error, ErrorCode.E_TTS_SERVICE);
      logger.warn('音频播放失败', appError.message);
      onError(appError);
      throw appError;
    }
  }

  pause(): void {
    this.current?.pause();
  }

  resume(): void {
    this.current?.resume();
  }

  stop(): void {
    if (this.current) {
      this.current.stop();
      this.current.release();
      this.current = null;
    }
  }

  setRate(rate: number): void {
    this.rate = rate;
    this.current?.setRate(rate);
  }
}
