import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useTheme } from '../theme/ThemeContext';
import type { BookSummary } from '../types';
import { BookCover } from './BookCover';

export interface BookGridItemProps {
  book: BookSummary;
  onPress(): void;
  onLongPress?(): void;
}

/** 书架网格项：封面、书名、作者与最近进度；长按交由页面做删除确认。 */
export function BookGridItem({
  book,
  onPress,
  onLongPress,
}: BookGridItemProps): React.ReactElement {
  const { colors } = useTheme();
  return (
    <TouchableOpacity
      style={styles.item}
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityLabel={`打开《${book.title}》`}
    >
      <BookCover uri={book.coverUri} title={book.title} />
      <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
        {book.title}
      </Text>
      <Text style={[styles.meta, { color: colors.textSecondary }]} numberOfLines={1}>
        {book.author || book.format.toUpperCase()}
      </Text>
      <View style={styles.progressRow}>
        <View style={[styles.progressTrack, { backgroundColor: colors.surfaceAlt }]}>
          <View
            style={[
              styles.progressFill,
              { backgroundColor: colors.primary, width: `${Math.min(100, Math.max(0, book.progressPercent))}%` },
            ]}
          />
        </View>
        <Text style={[styles.percent, { color: colors.textSecondary }]}>
          {Math.round(book.progressPercent)}%
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  item: { flex: 1, margin: 8, alignItems: 'center' },
  title: { marginTop: 8, fontSize: 14, fontWeight: '600', maxWidth: 160 },
  meta: { marginTop: 2, fontSize: 12, maxWidth: 160 },
  progressRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6, width: 140 },
  progressTrack: { height: 4, borderRadius: 2, flex: 1, overflow: 'hidden' },
  progressFill: { height: 4, borderRadius: 2 },
  percent: { marginLeft: 6, fontSize: 11 },
});
