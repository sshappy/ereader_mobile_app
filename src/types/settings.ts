import type { TTSConfig } from './tts';

export type Theme = 'light' | 'dark';
export type PageMode = 'scroll' | 'page';

export interface ReaderSettings {
  fontSize: number;
  lineHeight: number;
  theme: Theme;
  pageMode: PageMode;
}

export interface AppSettings {
  reader: ReaderSettings;
  tts: TTSConfig;
  complianceAccepted: boolean;
  version: number;
}
