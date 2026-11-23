import React from 'react';
import {
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { useTheme } from '../theme/ThemeContext';
import type { Chapter } from '../types';

export interface TocDrawerProps {
  visible: boolean;
  chapters: Chapter[];
  currentIndex: number;
  onSelect(index: number): void;
  onClose(): void;
}

/** 章节目录（R-14）：严格按 Chapter.index 升序展示。 */
export function TocDrawer({
  visible,
  chapters,
  currentIndex,
  onSelect,
  onClose,
}: TocDrawerProps): React.ReactElement {
  const { colors } = useTheme();
  const ordered = [...chapters].sort((left, right) => left.index - right.index);
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>目录</Text>
          <TouchableOpacity onPress={onClose} accessibilityLabel="关闭目录">
            <Text style={[styles.close, { color: colors.textSecondary }]}>关闭</Text>
          </TouchableOpacity>
        </View>
        <FlatList
          data={ordered}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[
                styles.row,
                item.index === currentIndex && { backgroundColor: colors.surfaceAlt },
                { borderBottomColor: colors.border },
              ]}
              onPress={() => onSelect(item.index)}
              accessibilityLabel={`跳转到${item.title}`}
            >
              <Text
                style={[
                  styles.rowText,
                  { color: item.index === currentIndex ? colors.primary : colors.text },
                ]}
                numberOfLines={1}
              >
                {item.title}
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingTop: 44 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  title: { fontSize: 18, fontWeight: '700' },
  close: { fontSize: 14 },
  row: { paddingVertical: 14, paddingHorizontal: 18, borderBottomWidth: 1 },
  rowText: { fontSize: 15 },
});
