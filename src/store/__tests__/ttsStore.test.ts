import { ErrorCode } from '../../constants/errorCodes';
import type { Book } from '../../types';

// 隔离原生引擎与真实 Store：只验证 TtsStore 的同意门禁与状态迁移。
jest.mock('../services', () => ({ getTtsService: jest.fn() }));
jest.mock('../readerStore', () => ({ useReaderStore: { getState: jest.fn() } }));
jest.mock('../settingsStore', () => ({ useSettingsStore: { getState: jest.fn() } }));

import { getTtsService } from '../services';
import { useReaderStore } from '../readerStore';
import { useSettingsStore } from '../settingsStore';

declare const require: (id: string) => typeof import('../ttsStore');

function makeEngine(channel: 'local' | 'cloud') {
  return {
    channel,
    prepare: jest.fn(async () => undefined),
    speak: jest.fn(async () => undefined),
    pause: jest.fn(async () => undefined),
    resume: jest.fn(async () => undefined),
    stop: jest.fn(async () => undefined),
    getVoices: jest.fn(async () => []),
    destroy: jest.fn(async () => undefined),
  };
}

const localEngine = makeEngine('local');
const cloudEngine = makeEngine('cloud');
// 云端引擎工厂：一旦被调用就说明构造了 CloudTtsService/EdgeTtsClient。
const cloudFactory = jest.fn(() => cloudEngine);
const fakeService = {
  getEngine: jest.fn((channel: 'local' | 'cloud') =>
    channel === 'cloud' ? cloudFactory() : localEngine,
  ),
  switchChannel: jest.fn(async (channel: 'local' | 'cloud') =>
    channel === 'cloud' ? cloudFactory() : localEngine,
  ),
  splitToSegments: jest.fn(() => []),
};

const book: Book = {
  id: 'b1',
  format: 'epub',
  metadata: { title: '测试书' },
  sourcePath: '/private/books/1-b.epub',
  originFileName: 'b.epub',
  fileSize: 10,
  chapters: [
    {
      id: 'ch-0000',
      index: 0,
      title: '第一章',
      href: 'c1.xhtml',
      html: '<p>你好。</p>',
      text: '你好。',
      charCount: 3,
    },
  ],
  addedAt: 1,
  lastOpenedAt: 1,
};

(getTtsService as unknown as jest.Mock).mockReturnValue(fakeService);
(useReaderStore.getState as unknown as jest.Mock).mockReturnValue({
  currentBook: book,
  openBook: jest.fn(async () => book),
});
(useSettingsStore.getState as unknown as jest.Mock).mockReturnValue({
  settings: {
    tts: {
      channel: 'cloud',
      rate: 1,
      cloudVoiceId: 'zh-CN-XiaoxiaoNeural',
      autoNextChapter: false,
      cloudConsent: false,
    },
  },
});

const { useTtsStore } = require('../ttsStore');

describe('TtsStore 云端同意门禁', () => {
  beforeEach(() => {
    useTtsStore.setState({
      consentRequired: false,
      pending: null,
      state: { status: 'idle', chapterIndex: 0, segmentIndex: 0, channel: 'local' },
    });
  });

  it('channel=cloud 且未同意时，start 不构造云端引擎、不切换通道', async () => {
    await useTtsStore.getState().start('b1', 0);

    expect(cloudFactory).not.toHaveBeenCalled();
    expect(fakeService.getEngine).not.toHaveBeenCalled();
    expect(fakeService.switchChannel).not.toHaveBeenCalled();

    const state = useTtsStore.getState();
    expect(state.consentRequired).toBe(true);
    expect(state.pending).toEqual({ bookId: 'b1', chapterIndex: 0 });
    expect(state.state.errorCode).toBe(ErrorCode.E_TTS_CONSENT_REQUIRED);
  });

  it('播放页直接切云端同样不构造云端引擎', async () => {
    await useTtsStore.getState().switchChannel('cloud');

    expect(cloudFactory).not.toHaveBeenCalled();
    expect(fakeService.switchChannel).not.toHaveBeenCalled();
    expect(useTtsStore.getState().consentRequired).toBe(true);
  });
});
