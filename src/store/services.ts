import { DrmGuard } from '../services/drmGuard';
import { getFileService } from '../services/fileServiceImpl';
import { LibraryService, type ILibraryService } from '../services/libraryService';
import { getBookParserFactory } from '../services/parser/bookParser';
import { getStorageService } from '../services/storageService';
import { AudioPlayerService } from '../services/tts/audioPlayerService';
import { CloudTtsService } from '../services/tts/cloudTtsService';
import { EdgeTtsClient } from '../services/tts/edgeTtsClient';
import { LocalTtsService } from '../services/tts/localTtsService';
import { TtsService } from '../services/tts/ttsService';

/**
 * 服务装配点（Store 与页面唯一的组合根）。
 * 所有依赖均来自 T01-T03 已实现的接口，本文件不新增业务逻辑。
 */

let libraryInstance: ILibraryService | null = null;
let ttsInstance: TtsService | null = null;

export function getFileServiceAdapter() {
  return getFileService();
}

export function getAppStorage() {
  return getStorageService();
}

export function getLibraryService(): ILibraryService {
  if (libraryInstance === null) {
    libraryInstance = new LibraryService({
      fileService: getFileService(),
      storage: getStorageService(),
      drmGuard: new DrmGuard(),
      parserFactory: getBookParserFactory(),
    });
  }
  return libraryInstance;
}

export function getTtsService(): TtsService {
  if (ttsInstance === null) {
    const fileService = getFileService();
    ttsInstance = new TtsService({
      local: new LocalTtsService(),
      // 云端引擎惰性创建：未获同意或从未切换时不会构造网络客户端。
      cloud: () =>
        new CloudTtsService({
          client: new EdgeTtsClient(fileService),
          player: new AudioPlayerService(),
          fileService,
        }),
    });
  }
  return ttsInstance;
}
