/** 全局错误码（共享知识第 6 条）：service 失败一律抛 AppError，禁止抛裸字符串。 */
export enum ErrorCode {
  E_UNSUPPORTED_FORMAT = 'E_UNSUPPORTED_FORMAT',
  E_DUPLICATE_BOOK = 'E_DUPLICATE_BOOK',
  E_DRM_DETECTED = 'E_DRM_DETECTED',
  E_PARSE_FAILED = 'E_PARSE_FAILED',
  E_FILE_READ_FAILED = 'E_FILE_READ_FAILED',
  E_TTS_NO_VOICE = 'E_TTS_NO_VOICE',
  E_TTS_NETWORK = 'E_TTS_NETWORK',
  E_TTS_TIMEOUT = 'E_TTS_TIMEOUT',
  E_TTS_SERVICE = 'E_TTS_SERVICE',
  E_TTS_CONSENT_REQUIRED = 'E_TTS_CONSENT_REQUIRED',
  E_STORAGE_FAILED = 'E_STORAGE_FAILED',
}

/** 错误码 → 默认用户可读文案（不改写弱化合规内容）。 */
export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  [ErrorCode.E_UNSUPPORTED_FORMAT]:
    '暂不支持该格式，建议先用 Calibre 等工具转换为 EPUB 后导入',
  [ErrorCode.E_DUPLICATE_BOOK]: '该文件已在书架，无需重复导入',
  [ErrorCode.E_DRM_DETECTED]:
    '该文件含有 DRM 保护，已拒绝导入并删除临时文件；本 App 仅支持无 DRM 的自有电子书',
  [ErrorCode.E_PARSE_FAILED]: '解析失败：文件可能损坏或格式不受支持，建议先转换为 EPUB 后重试',
  [ErrorCode.E_FILE_READ_FAILED]: '文件读取失败，请确认文件可访问后重试',
  [ErrorCode.E_TTS_NO_VOICE]: '设备未安装中文嗓音，可切换云端 TTS',
  [ErrorCode.E_TTS_NETWORK]: '云端朗读网络异常，请检查网络或切换本地 TTS',
  [ErrorCode.E_TTS_TIMEOUT]: '云端朗读请求超时，请重试或切换本地 TTS',
  [ErrorCode.E_TTS_SERVICE]: '云端语音服务暂不可用，请稍后重试或切换本地 TTS',
  [ErrorCode.E_TTS_CONSENT_REQUIRED]: '请先确认云端朗读知情声明，或切换本地 TTS',
  [ErrorCode.E_STORAGE_FAILED]: '本地存储失败，请重试',
};
