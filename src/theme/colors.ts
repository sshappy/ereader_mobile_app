import type { Theme } from '../types';

export interface ThemeColors {
  background: string;
  surface: string;
  surfaceAlt: string;
  text: string;
  textSecondary: string;
  primary: string;
  border: string;
  error: string;
  warning: string;
  coverPlaceholder: string;
  overlay: string;
}

/** 日间/夜间色板：正文与背景对比度优先。 */
export const colors: Record<Theme, ThemeColors> = {
  light: {
    background: '#FFFFFF',
    surface: '#F7F7F7',
    surfaceAlt: '#EFEFEF',
    text: '#222222',
    textSecondary: '#777777',
    primary: '#4A90E2',
    border: '#DDDDDD',
    error: '#C0392B',
    warning: '#9A6B00',
    coverPlaceholder: '#E3E7ED',
    overlay: 'rgba(0,0,0,0.45)',
  },
  dark: {
    background: '#151515',
    surface: '#202020',
    surfaceAlt: '#2A2A2A',
    text: '#EDEDED',
    textSecondary: '#A5A5A5',
    primary: '#6BA8E8',
    border: '#3A3A3A',
    error: '#F1948A',
    warning: '#E8C47A',
    coverPlaceholder: '#333333',
    overlay: 'rgba(0,0,0,0.65)',
  },
};
