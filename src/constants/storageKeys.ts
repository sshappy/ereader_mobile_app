/** AsyncStorage key 统一前缀（共享知识第 3 条）。结构变更时递增 v 并做迁移。 */
export const STORAGE_KEY_PREFIX = 'ereader:v1:';

export const STORAGE_KEYS = {
  BOOKS: `${STORAGE_KEY_PREFIX}books`,
  SETTINGS: `${STORAGE_KEY_PREFIX}settings`,
  TTS_CONFIG: `${STORAGE_KEY_PREFIX}ttsConfig`,
  COMPLIANCE_ACCEPTED: `${STORAGE_KEY_PREFIX}complianceAccepted`,
  CLOUD_CONSENT: `${STORAGE_KEY_PREFIX}cloudConsent`,
} as const;

/** 生成单本书的进度 key。 */
export function progressKey(bookId: string): string {
  return `${STORAGE_KEY_PREFIX}progress:${bookId}`;
}
