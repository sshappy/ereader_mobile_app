import type {
  SpeakOptions,
  TTSChannel,
  TTSConfig,
  TTSSegment,
  TtsHandlers,
  Voice,
} from '../../types';
import { splitToSegments } from '../../utils/text';

/** 双通道引擎接口：引擎只通过 TtsHandlers 上报，不直接改 UI。 */
export interface ITtsEngine {
  readonly channel: TTSChannel;
  prepare(config: TTSConfig): Promise<void>;
  speak(options: SpeakOptions, handlers: TtsHandlers): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  stop(): Promise<void>;
  getVoices(): Promise<Voice[]>;
  destroy(): Promise<void>;
}

export interface ITtsService {
  getEngine(channel: TTSChannel): ITtsEngine;
  splitToSegments(text: string): TTSSegment[];
}

export interface TtsServiceDeps {
  local: ITtsEngine;
  cloud: ITtsEngine | (() => ITtsEngine);
}

/**
 * 通道工厂：惰性创建引擎；switchChannel 会先 stop 旧引擎，
 * 避免本地与云端同时出声（共享知识第 10 条）。
 */
export class TtsService implements ITtsService {
  private readonly engines = new Map<TTSChannel, ITtsEngine>();
  private readonly factories: Record<TTSChannel, () => ITtsEngine>;
  private activeChannel: TTSChannel | null = null;

  constructor(deps: TtsServiceDeps) {
    const localEngine = deps.local;
    const cloudValue = deps.cloud;
    this.factories = {
      local: () => localEngine,
      cloud: typeof cloudValue === 'function' ? cloudValue : () => cloudValue,
    };
  }

  getEngine(channel: TTSChannel): ITtsEngine {
    const existing = this.engines.get(channel);
    if (existing) {
      return existing;
    }
    const engine = this.factories[channel]();
    this.engines.set(channel, engine);
    return engine;
  }

  async prepare(channel: TTSChannel, config: TTSConfig): Promise<void> {
    await this.getEngine(channel).prepare(config);
  }

  /** 切换通道：必须先停止旧引擎，再返回新引擎。 */
  async switchChannel(channel: TTSChannel): Promise<ITtsEngine> {
    if (this.activeChannel !== null && this.activeChannel !== channel) {
      await this.getEngine(this.activeChannel).stop();
    }
    this.activeChannel = channel;
    return this.getEngine(channel);
  }

  getActiveChannel(): TTSChannel | null {
    return this.activeChannel;
  }

  async stopAll(): Promise<void> {
    for (const engine of this.engines.values()) {
      await engine.stop();
    }
    this.activeChannel = null;
  }

  splitToSegments(text: string): TTSSegment[] {
    return splitToSegments(text);
  }
}
