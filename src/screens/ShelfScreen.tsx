import React, { useCallback, useState } from 'react';
import {
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { ComplianceModal } from '../components/ComplianceModal';
import { BookGridItem } from '../components/BookGridItem';
import { ErrorBanner } from '../components/ErrorBanner';
import { LoadingOverlay } from '../components/LoadingOverlay';
import { SHELF_FOOTER_NOTICE } from '../constants/compliance';
import type { RootStackParamList } from '../navigation/types';
import { useLibraryStore } from '../store/libraryStore';
import { getFileServiceAdapter } from '../store/services';
import { useSettingsStore } from '../store/settingsStore';
import { useTheme } from '../theme/ThemeContext';
import type { BookSummary } from '../types';

type ShelfNavigation = NativeStackNavigationProp<RootStackParamList, 'Shelf'>;

/** 书架页（R-04）：导入前强制合规声明，导入结果明确反馈。 */
export function ShelfScreen(): React.ReactElement {
  const navigation = useNavigation<ShelfNavigation>();
  const { colors } = useTheme();
  const books = useLibraryStore((state) => state.books);
  const loading = useLibraryStore((state) => state.loading);
  const error = useLibraryStore((state) => state.error);
  const refresh = useLibraryStore((state) => state.refresh);
  const importBook = useLibraryStore((state) => state.importBook);
  const deleteBook = useLibraryStore((state) => state.deleteBook);
  const clearError = useLibraryStore((state) => state.clearError);
  const complianceAccepted = useSettingsStore((state) => state.settings.complianceAccepted);
  const acceptCompliance = useSettingsStore((state) => state.acceptCompliance);
  const [showCompliance, setShowCompliance] = useState(false);

  // 每次回到书架都刷新，保证阅读进度百分比与最近阅读排序即时可见。
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const pickAndImport = useCallback(async () => {
    const fileService = getFileServiceAdapter();
    const granted = await fileService.requestStoragePermission();
    if (!granted) {
      Alert.alert('无法导入', '未获得文件读取权限。');
      return;
    }
    const file = await fileService.pickEbook();
    if (!file) {
      return;
    }
    const ok = await importBook(file);
    const message = ok ? '已加入书架' : useLibraryStore.getState().error ?? '请稍后重试';
    Alert.alert(ok ? '导入成功' : '导入失败', message);
  }, [importBook]);

  const onImportPress = useCallback(() => {
    if (complianceAccepted) {
      void pickAndImport();
      return;
    }
    setShowCompliance(true);
  }, [complianceAccepted, pickAndImport]);

  const onConfirmCompliance = useCallback(() => {
    acceptCompliance();
    setShowCompliance(false);
    void pickAndImport();
  }, [acceptCompliance, pickAndImport]);

  const onDelete = useCallback(
    (book: BookSummary) => {
      Alert.alert('删除书籍', `确定要从书架移除《${book.title}》吗？`, [
        { text: '取消', style: 'cancel' },
        {
          text: '删除',
          style: 'destructive',
          onPress: () => void deleteBook(book.id),
        },
      ]);
    },
    [deleteBook],
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>书架</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={() => navigation.navigate('Settings')} accessibilityLabel="设置">
            <Text style={{ color: colors.textSecondary, fontSize: 14 }}>设置</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.importButton, { backgroundColor: colors.primary }]}
            onPress={onImportPress}
            accessibilityLabel="导入电子书"
          >
            <Text style={styles.importText}>+ 导入</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ErrorBanner message={error} onDismiss={clearError} />

      <FlatList
        data={books}
        numColumns={2}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <BookGridItem
            book={item}
            onPress={() => navigation.navigate('Reader', { bookId: item.id, chapterIndex: 0 })}
            onLongPress={() => onDelete(item)}
          />
        )}
        ListEmptyComponent={
          <Text style={[styles.empty, { color: colors.textSecondary }]}>
            书架还是空的，点击右上角导入自有电子书
          </Text>
        }
        contentContainerStyle={styles.list}
      />

      <View style={styles.footer}>
        <Text style={[styles.footerText, { color: colors.textSecondary }]}>{SHELF_FOOTER_NOTICE}</Text>
      </View>

      <ComplianceModal
        visible={showCompliance}
        onConfirm={onConfirmCompliance}
        onCancel={() => setShowCompliance(false)}
      />
      <LoadingOverlay visible={loading} message="正在导入并解析电子书…" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 12,
  },
  title: { fontSize: 24, fontWeight: '700' },
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  importButton: { marginLeft: 16, borderRadius: 6, paddingHorizontal: 14, paddingVertical: 8 },
  importText: { color: '#FFFFFF', fontWeight: '600' },
  list: { paddingBottom: 16 },
  empty: { textAlign: 'center', marginTop: 80, fontSize: 14 },
  footer: { paddingVertical: 12, alignItems: 'center' },
  footerText: { fontSize: 12 },
});
