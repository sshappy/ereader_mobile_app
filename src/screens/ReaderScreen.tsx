import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import WebView from 'react-native-webview';

import { ErrorBanner } from '../components/ErrorBanner';
import { LoadingOverlay } from '../components/LoadingOverlay';
import { ReaderSettingsPanel } from '../components/ReaderSettingsPanel';
import { TocDrawer } from '../components/TocDrawer';
import type { ReaderRouteProp, RootStackParamList } from '../navigation/types';
import { useReaderStore } from '../store/readerStore';
import { useSettingsStore } from '../store/settingsStore';
import { useTheme } from '../theme/ThemeContext';
import { colors as themeColors } from '../theme/colors';
import type { ReaderSettings } from '../types';

/** 把净化后的章节 HTML 与主题 CSS 注入 WebView；脚本只上报滚动比例。 */
export function buildReaderHtml(chapterHtml: string, settings: ReaderSettings): string {
  const palette = themeColors[settings.theme];
  const css = [
    `body{margin:0;padding:16px;background:${palette.background};color:${palette.text};`,
    `font-size:${settings.fontSize}px;line-height:${settings.lineHeight};}`,
    'img{max-width:100%;height:auto;}',
    'p{margin:0 0 1em 0;}',
  ].join('');
  const script = [
    'function postProgress(){',
    'var max=Math.max(1,document.body.scrollHeight-window.innerHeight);',
    'var ratio=Math.min(1,Math.max(0,window.scrollY/max));',
    'if(window.ReactNativeWebView){window.ReactNativeWebView.postMessage(JSON.stringify({type:"progress",ratio:ratio}));}',
    '}',
    'window.addEventListener("load",postProgress);',
    'window.addEventListener("scroll",postProgress);',
  ].join('');
  return (
    '<!DOCTYPE html><html><head><meta charset="utf-8" />' +
    '<meta name="viewport" content="width=device-width,initial-scale=1" />' +
    `<style>${css}</style></head><body>${chapterHtml}` +
    `<script>${script}</script></body></html>`
  );
}

type ReaderNavigation = NativeStackNavigationProp<RootStackParamList, 'Reader'>;
type ReaderRoute = ReaderRouteProp;

/** 阅读器页（R-05/R-06/R-07/R-14）：WebView 正文 + 目录 + 设置面板 + 进度上报。 */
export function ReaderScreen(): React.ReactElement {
  const route = useRoute<ReaderRoute>();
  const navigation = useNavigation<ReaderNavigation>();
  const { bookId, chapterIndex: requestedIndex = 0 } = route.params;
  const { colors } = useTheme();

  const currentBook = useReaderStore((state) => state.currentBook);
  const progress = useReaderStore((state) => state.progress);
  const loading = useReaderStore((state) => state.loading);
  const error = useReaderStore((state) => state.error);
  const openBook = useReaderStore((state) => state.openBook);
  const jumpToChapter = useReaderStore((state) => state.jumpToChapter);
  const saveProgress = useReaderStore((state) => state.saveProgress);
  const clearError = useReaderStore((state) => state.clearError);
  const readerSettings = useSettingsStore((state) => state.settings.reader);
  const updateReader = useSettingsStore((state) => state.updateReader);

  const [showToc, setShowToc] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    let active = true;
    void openBook(bookId).then((book) => {
      if (active && book && requestedIndex > 0) {
        void jumpToChapter(requestedIndex);
      }
    });
    return () => {
      active = false;
    };
  }, [bookId, requestedIndex, openBook, jumpToChapter]);

  const chapterIndex = Math.min(
    progress?.chapterIndex ?? requestedIndex,
    (currentBook?.chapters.length ?? 1) - 1,
  );
  const chapter = currentBook?.chapters[chapterIndex];
  const html = useMemo(
    () => buildReaderHtml(chapter?.html ?? '', readerSettings),
    [chapter?.html, readerSettings],
  );

  const onMessage = useCallback(
    (event: { nativeEvent: { data: string } }) => {
      try {
        const payload = JSON.parse(event.nativeEvent.data) as {
          type?: string;
          ratio?: number;
        };
        if (payload.type === 'progress' && typeof payload.ratio === 'number') {
          const offset = Math.round(payload.ratio * (chapter?.charCount ?? 0));
          void saveProgress({ chapterIndex, offset });
        }
      } catch {
        // WebView 可能收到非本应用的消息，忽略即可。
      }
    },
    [chapter?.charCount, chapterIndex, saveProgress],
  );

  const goChapter = useCallback(
    (index: number) => {
      setShowToc(false);
      void jumpToChapter(index);
    },
    [jumpToChapter],
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} accessibilityLabel="返回书架">
          <Text style={{ color: colors.text }}>← 返回</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
          {currentBook?.metadata.title ?? '阅读中'}
        </Text>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={() => setShowToc(true)} accessibilityLabel="目录">
            <Text style={{ color: colors.text }}>目录</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.listenButton}
            onPress={() =>
              navigation.navigate('Player', { bookId, chapterIndex })
            }
            accessibilityLabel="听书"
          >
            <Text style={styles.listenText}>听书</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ErrorBanner message={error} onDismiss={clearError} />

      {chapter ? (
        <WebView
          source={{ html }}
          originWhitelist={['*']}
          onMessage={onMessage}
          style={[styles.webview, { backgroundColor: colors.background }]}
          testID="reader-webview"
        />
      ) : (
        <View style={styles.placeholder}>
          <Text style={{ color: colors.textSecondary }}>暂无可读章节</Text>
        </View>
      )}

      <View style={styles.footer}>
        <TouchableOpacity
          onPress={() => goChapter(chapterIndex - 1)}
          disabled={chapterIndex <= 0}
          accessibilityLabel="上一章"
        >
          <Text style={{ color: chapterIndex <= 0 ? colors.textSecondary : colors.text }}>◀ 上一章</Text>
        </TouchableOpacity>
        <Text style={[styles.progress, { color: colors.textSecondary }]}>
          {Math.round(progress?.percent ?? 0)}%
        </Text>
        <TouchableOpacity
          onPress={() => goChapter(chapterIndex + 1)}
          disabled={chapterIndex >= (currentBook?.chapters.length ?? 1) - 1}
          accessibilityLabel="下一章"
        >
          <Text style={{ color: colors.text }}>下一章 ▶</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setShowSettings(true)}
          accessibilityLabel="阅读设置"
          style={styles.settingsButton}
        >
          <Text style={{ color: colors.text }}>Aa</Text>
        </TouchableOpacity>
      </View>

      <TocDrawer
        visible={showToc}
        chapters={currentBook?.chapters ?? []}
        currentIndex={chapterIndex}
        onSelect={goChapter}
        onClose={() => setShowToc(false)}
      />
      <ReaderSettingsPanel
        visible={showSettings}
        settings={readerSettings}
        onChange={updateReader}
        onClose={() => setShowSettings(false)}
      />
      <LoadingOverlay visible={loading} message="正在打开书籍…" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 44, paddingBottom: 10 },
  title: { flex: 1, textAlign: 'center', fontSize: 15, fontWeight: '600', marginHorizontal: 8 },
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  listenButton: { marginLeft: 12, backgroundColor: '#4A90E2', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6 },
  listenText: { color: '#FFFFFF', fontSize: 13 },
  webview: { flex: 1 },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 },
  progress: { fontSize: 13 },
  settingsButton: { marginLeft: 10, paddingHorizontal: 8 },
});
