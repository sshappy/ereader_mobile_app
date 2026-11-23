import type { TtsHandlers } from '../../../types';
import { ErrorCode } from '../../../constants/errorCodes';
import { AppError } from '../../../utils/errors';
import type { IFileService } from '../../fileService';
import type { IAudioPlayer } from '../audioPlayerService';
import type { IEdgeTtsClient } from '../edgeTtsClient';
import { CloudTtsService } from '../cloudTtsService';
import { TtsService } from '../ttsService';

function makeClient(shouldFail = false): IEdgeTtsClient & { calls: string[] } {
  return {
    calls: [],
    async synthesize(text) {
      this.calls.push(text);
      if (shouldFail) {
        throw new AppError(ErrorCode.E_TTS_TIMEOUT);
      }
      return `file:///cache/${this.calls.length}.mp3`;
    },
  };
}

function makePlayer(): IAudioPlayer & { played: string[]; stopped: number } {
  return {
    played: [],
    stopped: 0,
    async play(uri, onEnd) {
      this.played.push(uri);
      onEnd();
    },
    pause() {},
    resume() {},
    stop() {
      this.stopped += 1;
    },
    setRate() {},
  };
}

function makeFileService(): IFileService {
  return {
    async pickEbook() {
      return null;
    },
    async requestStoragePermission() {
      return true;
    },
    async copyToPrivateDir() {
      return '';
    },
    async readAsBase64() {
      return '';
    },
    async writeCacheFile() {
      return 'file:///cache/audio.mp3';
    },
    async exists() {
      return true;
    },
    async remove() {},
    getBooksDir() {
      return '/books';
    },
    getCacheDir() {
      return '/cache';
    },
  };
}

function makeHandlers(): TtsHandlers & {
  states: string[];
  boundaries: Array<[number, number]>;
  errors: AppError[];
  chapterEnds: number;
} {
  return {
    states: [],
    boundaries: [],
    errors: [],
    chapterEnds: 0,
    onStateChange(status) {
      this.states.push(status);
    },
    onBoundary(index, offset) {
      this.boundaries.push([index, offset]);
    },
    onError(error) {
      this.errors.push(error);
    },
    onChapterEnd() {
      this.chapterEnds += 1;
    },
  };
}

const baseConfig = {
  channel: 'cloud' as const,
  rate: 1,
  cloudVoiceId: 'zh-CN-XiaoxiaoNeural',
  autoNextChapter: false,
  cloudConsent: true,
};

describe('CloudTtsService', () => {
  it('按分片队列合成并播放，章末上报事件', async () => {
    const client = makeClient();
    const player = makePlayer();
    const service = new CloudTtsService({ client, player });
    await service.prepare(baseConfig);
    const handlers = makeHandlers();

    await service.speak(
      { text: '第一句。第二句！第三句？', rate: 1 },
      handlers,
    );

    expect(client.calls).toEqual(['第一句。', '第二句！', '第三句？']);
    expect(player.played).toHaveLength(3);
    expect(handlers.boundaries).toEqual([
      [0, 4],
      [1, 8],
      [2, 12],
    ]);
    expect(handlers.chapterEnds).toBe(1);
    expect(handlers.errors).toHaveLength(0);
  });

  it('合成失败：上报 E_TTS_* 并停止队列', async () => {
    const client = makeClient(true);
    const player = makePlayer();
    const service = new CloudTtsService({ client, player });
    await service.prepare(baseConfig);
    const handlers = makeHandlers();

    await service.speak({ text: '第一句。第二句。', rate: 1 }, handlers);

    expect(client.calls).toHaveLength(1);
    expect(player.played).toHaveLength(0);
    expect(handlers.errors).toHaveLength(1);
    expect(handlers.errors[0].code).toBe(ErrorCode.E_TTS_TIMEOUT);
    expect(handlers.states).toContain('error');
    expect(handlers.chapterEnds).toBe(0);
  });

  it('未同意云端告知时不发起任何请求', async () => {
    const client = makeClient();
    const player = makePlayer();
    const service = new CloudTtsService({ client, player });
    await service.prepare({ ...baseConfig, cloudConsent: false });
    const handlers = makeHandlers();

    await service.speak({ text: '你好。', rate: 1 }, handlers);

    expect(client.calls).toHaveLength(0);
    expect(handlers.errors[0].code).toBe(ErrorCode.E_TTS_CONSENT_REQUIRED);
  });

  it('stop 会播放器中止并清理音频缓存', async () => {
    const client = makeClient();
    const player = makePlayer();
    const fileService = makeFileService();
    const removed: string[] = [];
    fileService.remove = async (path) => {
      removed.push(path);
    };
    const service = new CloudTtsService({ client, player, fileService });
    await service.prepare(baseConfig);
    await service.speak({ text: '你好。', rate: 1 }, makeHandlers());
    await service.stop();

    expect(player.stopped).toBe(1);
    expect(removed).toEqual(['file:///cache/1.mp3']);
  });
});

describe('TtsService 通道切换', () => {
  function makeEngine(channel: 'local' | 'cloud') {
    return {
      channel,
      async prepare() {},
      async speak() {},
      async pause() {},
      async resume() {},
      async stop() {},
      async getVoices() {
        return [];
      },
      async destroy() {},
    };
  }

  it('切换前先停止旧引擎，不双通道并发出声', async () => {
    const local = makeEngine('local');
    const cloud = makeEngine('cloud');
    const stopCalls: string[] = [];
    local.stop = async () => {
      stopCalls.push('local');
    };
    cloud.stop = async () => {
      stopCalls.push('cloud');
    };
    const service = new TtsService({ local, cloud });
    await service.switchChannel('local');
    const next = await service.switchChannel('cloud');
    expect(next.channel).toBe('cloud');
    expect(stopCalls).toEqual(['local']);
  });

  it('splitToSegments 复用纯 JS 分段器', () => {
    const service = new TtsService({
      local: makeEngine('local'),
      cloud: makeEngine('cloud'),
    });
    expect(service.splitToSegments('你好。世界。')).toHaveLength(2);
  });
});
