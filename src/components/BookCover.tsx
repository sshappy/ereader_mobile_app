import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../theme/ThemeContext';

export interface BookCoverProps {
  uri?: string;
  title: string;
  width?: number;
  height?: number;
}

/** 封面加载失败或无封面时用书名占位，避免空白网格。 */
export function BookCover({
  uri,
  title,
  width = 108,
  height = 148,
}: BookCoverProps): React.ReactElement {
  const { colors } = useTheme();
  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={[styles.cover, { width, height, backgroundColor: colors.coverPlaceholder }]}
        resizeMode="cover"
        accessibilityLabel={`${title} 封面`}
      />
    );
  }
  return (
    <View
      style={[
        styles.cover,
        styles.placeholder,
        { width, height, backgroundColor: colors.coverPlaceholder },
      ]}
      accessibilityLabel={`${title} 暂无封面`}
    >
      <Text style={[styles.placeholderText, { color: colors.textSecondary }]} numberOfLines={4}>
        {title.slice(0, 12)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  cover: { borderRadius: 6 },
  placeholder: { alignItems: 'center', justifyContent: 'center', padding: 8 },
  placeholderText: { fontSize: 13, textAlign: 'center', lineHeight: 18 },
});
