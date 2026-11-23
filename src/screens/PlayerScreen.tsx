import React, { useEffect, useMemo } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { CloudConsentModal } from '../components/CloudConsentModal';
import { ErrorBanner } from '../components/ErrorBanner';
import { PlayerControls } from '../components/PlayerControls';
import type { PlayerRouteProp, RootStackParamList } from '../navigation/types';
import { useReaderStore } from '../store/readerStore';
import { useSettingsStore } from '../store/settingsStore';
import { useTtsStore } from '../store/ttsStore';
import { useTheme } from '../theme/ThemeContext';
import type { PlaybackStatus } from '../types';

const STATUS_LABEL: Record<PlaybackStatus, string> = {
  idle: '未开始',
  loading: '准备中',
  playing: '正在播放',
  paused: '已暂停',
  stopped: '已停止',
  error: '播放失败',
};

type PlayerNavigation = NativeStackNavigationProp<RootStackParamList, 'Player'>;
type PlayerRoute = PlayerRouteProp;

/** 听书播放页（R-08/R-09/R-10）：状态来自 TtsStore，返回阅读器不中断播放。 */
export function PlayerScreen(): React.ReactElement {
  const route = useRoute<PlayerRoute>();
  const navigation = useNavigation<PlayerNavigation>();
  const { bookId, chapterIndex } = route.params;
  const { colors } = useTheme();

  const playback = useTtsStore((state) => state.state);
  const error = useTtsStore((state) => state.error);
  const consentRequired = useTtsStore((state) => state.consentRequired);
  const voices = useTtsStore((state) => state.voices);
  const start = useTtsStore((state) => state.start);
  const pause = useTtsStore((state) => state.pause);
  const resume = useTtsStore((state) => state.resume);
  const stop = useTtsStore((state) => state.stop);
  const switchChannel = useTtsStore((state) => state.switchChannel);
  const grantCloudConsent = useTtsStore((state) => state.grantCloudConsent);
  const rejectCloudConsent = useTtsStore((state) => state.rejectCloudConsent);
  const loadVoices = useTtsStore((state) => state.loadVoices);
  const clearError = useTtsStore((state) => state.clearError);

  const config = useSettingsStore((state) => state.settings.tts);
  const setRate = useSettingsStore((state) => state.setRate);
  const setVoice = useSettingsStore((state) => state.setVoice);
  const setAutoNextChapter = useSettingsStore((state) => state.setAutoNextChapter);
  const currentBook = useReaderStore((state) => state.currentBook);

  useEffect(() => {
    void loadVoices();
    void start(bookId, chapterIndex);
    // 不在卸载时 stop：返回阅读器应保持播放状态。
  }, [bookId, chapterIndex, loadVoices, start]);

  const chapter = currentBook?.chapters[playback.chapterIndex];
  const availableVoices = useMemo(
    () => voices.filter((voice) => voice.channel === playback.channel).slice(0, 8),
    [voices, playback.channel],
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <TouchableOpacity
        style={styles.back}
        onPress={() => navigation.goBack()}
        accessibilityLabel="返回阅读器"
      >
        <Text style={{ color: colors.text }}>← 返回阅读器</Text>
      </TouchableOpacity>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.bookTitle, { color: colors.text }]} numberOfLines={1}>
          {currentBook?.metadata.title ?? '听书'}
        </Text>
        <Text style={[styles.chapterTitle, { color: colors.textSecondary }]} numberOfLines={1}>
          当前：{chapter?.title ?? `第 ${playback.chapterIndex + 1} 章`}
        </Text>
        <Text style={[styles.status, { color: colors.primary }]}>{STATUS_LABEL[playback.status]}</Text>

        <ErrorBanner message={playback.message ?? error} onDismiss={clearError} />

        <PlayerControls
          state={playback}
          onPlay={() => void start(bookId, playback.chapterIndex)}
          onPause={() => void pause()}
          onStop={() => void stop()}
          onPrevChapter={() => void start(bookId, Math.max(0, playback.chapterIndex - 1))}
          onNextChapter={() =>
            void start(
              bookId,
              Math.min((currentBook?.chapters.length ?? 1) - 1, playback.chapterIndex + 1),
            )
          }
          onSwitchChannel={(channel) => void switchChannel(channel)}
        />

        <Text style={[styles.sectionTitle, { color: colors.text }]}>语速</Text>
        <View style={styles.chipRow}>
          {[0.75, 1, 1.25, 1.5].map((rate) => (
            <TouchableOpacity
              key={String(rate)}
              style={[
                styles.chip,
                { borderColor: config.rate === rate ? colors.primary : colors.border },
              ]}
              onPress={() => setRate(rate)}
              accessibilityLabel={`语速 ${rate} 倍`}
            >
              <Text style={{ color: config.rate === rate ? colors.primary : colors.textSecondary }}>
                {rate}x
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>音色</Text>
        <View style={styles.chipRow}>
          {availableVoices.length === 0 ? (
            <Text style={{ color: colors.textSecondary }}>当前通道暂无可用音色</Text>
          ) : (
            availableVoices.map((voice) => {
              const active =
                playback.channel === 'cloud'
                  ? config.cloudVoiceId === voice.id
                  : config.localVoiceId === voice.id;
              return (
                <TouchableOpacity
                  key={voice.id}
                  style={[styles.chip, { borderColor: active ? colors.primary : colors.border }]}
                  onPress={() => setVoice(playback.channel, voice.id)}
                  accessibilityLabel={`音色 ${voice.name}`}
                >
                  <Text style={{ color: active ? colors.primary : colors.textSecondary }}>
                    {voice.name}
                  </Text>
                </TouchableOpacity>
              );
            })
          )}
        </View>

        <TouchableOpacity
          style={styles.switchRow}
          onPress={() => setAutoNextChapter(!config.autoNextChapter)}
          accessibilityLabel="章末续播下一章"
        >
          <Text style={{ color: colors.text }}>
            章末续播下一章：{config.autoNextChapter ? '开' : '关'}
          </Text>
        </TouchableOpacity>
      </ScrollView>

      <CloudConsentModal
        visible={consentRequired}
        onAgree={() => void grantCloudConsent()}
        onDecline={() => void rejectCloudConsent()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  back: { paddingHorizontal: 16, paddingTop: 48, paddingBottom: 10 },
  content: { paddingHorizontal: 20, paddingBottom: 32, alignItems: 'center' },
  bookTitle: { fontSize: 20, fontWeight: '700', marginTop: 12 },
  chapterTitle: { fontSize: 14, marginTop: 6 },
  status: { fontSize: 13, marginTop: 10 },
  sectionTitle: { alignSelf: 'flex-start', fontSize: 14, fontWeight: '600', marginTop: 18, marginBottom: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
  chip: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7, margin: 4 },
  switchRow: { marginTop: 22, paddingVertical: 10 },
});
