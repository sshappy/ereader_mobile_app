import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useTheme } from '../theme/ThemeContext';

export interface ErrorBannerProps {
  message?: string | null;
  onDismiss?(): void;
}

/** 统一可读错误展示（文案来自 toUserMessage / ImportResult.message）。 */
export function ErrorBanner({ message, onDismiss }: ErrorBannerProps): React.ReactElement | null {
  const { colors } = useTheme();
  if (!message) {
    return null;
  }
  return (
    <View style={[styles.banner, { backgroundColor: colors.error }]} accessibilityRole="alert">
      <Text style={styles.text}>{message}</Text>
      {onDismiss ? (
        <TouchableOpacity onPress={onDismiss} accessibilityLabel="关闭错误提示">
          <Text style={styles.close}>×</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 6,
    marginHorizontal: 12,
    marginTop: 8,
  },
  text: { flex: 1, color: '#FFFFFF', fontSize: 13, lineHeight: 18 },
  close: { color: '#FFFFFF', fontSize: 20, marginLeft: 10 },
});
