import React, { createContext, useCallback, useContext, useMemo } from 'react';

import { useSettingsStore } from '../store/settingsStore';
import type { Theme } from '../types';
import { colors, type ThemeColors } from './colors';

export interface ThemeContextValue {
  theme: Theme;
  colors: ThemeColors;
  setTheme(theme: Theme): void;
  toggleTheme(): void;
}

const DEFAULT_THEME: ThemeContextValue = {
  theme: 'light',
  colors: colors.light,
  setTheme: () => undefined,
  toggleTheme: () => undefined,
};

export const ThemeContext = createContext<ThemeContextValue>(DEFAULT_THEME);

/** 主题 Provider：主题值来自 SettingsStore，切换即持久化。 */
export function ThemeProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const theme = useSettingsStore((state) => state.settings.reader.theme);
  const updateReader = useSettingsStore((state) => state.updateReader);

  const setTheme = useCallback(
    (next: Theme) => updateReader({ theme: next }),
    [updateReader],
  );
  const toggleTheme = useCallback(
    () => setTheme(theme === 'light' ? 'dark' : 'light'),
    [setTheme, theme],
  );

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, colors: colors[theme], setTheme, toggleTheme }),
    [theme, setTheme, toggleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
