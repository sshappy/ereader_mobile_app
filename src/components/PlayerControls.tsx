import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useTheme } from '../theme/ThemeContext';
import type { PlaybackState, TTSChannel } from '../types';

export interface PlayerControlsProps {
  state: PlaybackState;
  onPlay(): void;
  onPause(): void;
  onStop(): void;
  onPrevChapter(): void;
  onNextChapter(): void;
  onSwitchChannel(channel: TTSChannel): void;
}

/** 播放控制条（R-10）：按钮可用性由 PlaybackState 单一来源决定。 */
export function PlayerControls({
  state,
  onPlay,
  onPause,
  onStop,
  onPrevChapter,
  onNextChapter,
  onSwitchChannel,
}: PlayerControlsProps): React.ReactElement {
  const { colors } = useTheme();
  const isPlaying = state.status === 'playing';
  const isLoading = state.status === 'loading';

  return (
    <View style={styles.root}>
      <View style={styles.row}>
        <TouchableOpacity style={styles.control} onPress={onPrevChapter} accessibilityLabel="上一章">
          <Text style={{ color: colors.text, fontSize: 18 }}>◀◀</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.control, styles.primary, { backgroundColor: colors.primary }]}
          onPress={isPlaying ? onPause : onPlay}
          disabled={isLoading}
          accessibilityLabel={isPlaying ? '暂停' : '播放'}
        >
          <Text style={styles.primaryText}>{isPlaying ? '暂停' : '播放'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.control} onPress={onStop} accessibilityLabel="停止">
          <Text style={{ color: colors.text, fontSize: 18 }}>■</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.control} onPress={onNextChapter} accessibilityLabel="下一章">
          <Text style={{ color: colors.text, fontSize: 18 }}>▶▶</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.row}>
        <TouchableOpacity
          style={[styles.channel, state.channel === 'local' && { borderColor: colors.primary }]}
          onPress={() => onSwitchChannel('local')}
          accessibilityLabel="切换本地离线 TTS"
        >
          <Text style={{ color: state.channel === 'local' ? colors.primary : colors.textSecondary }}>
            本地离线 TTS
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.channel, state.channel === 'cloud' && { borderColor: colors.primary }]}
          onPress={() => onSwitchChannel('cloud')}
          accessibilityLabel="切换云端 TTS"
        >
          <Text style={{ color: state.channel === 'cloud' ? colors.primary : colors.textSecondary }}>
            云端 TTS
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { marginTop: 20 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginVertical: 10 },
  control: { width: 62, height: 44, alignItems: 'center', justifyContent: 'center' },
  primary: { borderRadius: 22 },
  primaryText: { color: '#FFFFFF', fontWeight: '600' },
  channel: { paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: '#CCCCCC', borderRadius: 16, marginHorizontal: 6 },
});
