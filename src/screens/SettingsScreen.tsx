import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';

import { CloudConsentModal } from '../components/CloudConsentModal';
import { ErrorBanner } from '../components/ErrorBanner';
import { COMPLIANCE_STATEMENT, CLOUD_TTS_NOTICE } from '../constants/compliance';
import { useSettingsStore } from '../store/settingsStore';
import { useTtsStore } from '../store/ttsStore';
import { useTheme } from '../theme/ThemeContext';
import type { TTSChannel, Theme } from '../types';

/** 设置页：通道/语速/音色/主题/字号；关闭云端同意立即停止并回退本地。 */
export function SettingsScreen(): React.ReactElement {
  const { colors } = useTheme();
  const settings = useSettingsStore((state) => state.settings);
  const updateReader = useSettingsStore((state) => state.updateReader);
  const setChannel = useSettingsStore((state) => state.setChannel);
  const setRate = useSettingsStore((state) => state.setRate);
  const setAutoNextChapter = useSettingsStore((state) => state.setAutoNextChapter);
  const grantCloudConsent = useSettingsStore((state) => state.grantCloudConsent);
  const revokeCloudConsent = useSettingsStore((state) => state.revokeCloudConsent);
  const ttsState = useTtsStore((state) => state.state);
  const ttsError = useTtsStore((state) => state.error);
  const switchChannel = useTtsStore((state) => state.switchChannel);
  const stop = useTtsStore((state) => state.stop);
  const clearError = useTtsStore((state) => state.clearError);
  const [showConsent, setShowConsent] = useState(false);

  const onSelectChannel = useCallback(
    (channel: TTSChannel) => {
      if (channel === 'cloud' && !settings.tts.cloudConsent) {
        setShowConsent(true);
        return;
      }
      void switchChannel(channel);
    },
    [settings.tts.cloudConsent, switchChannel],
  );

  const onEnableCloud = useCallback(() => {
    grantCloudConsent();
    setShowConsent(false);
    void switchChannel('cloud');
  }, [grantCloudConsent, switchChannel]);

  const onDisableCloud = useCallback(() => {
    revokeCloudConsent();
    setChannel('local');
    void stop().then(() => void switchChannel('local'));
  }, [revokeCloudConsent, setChannel, stop, switchChannel]);

  const chip = (label: string, active: boolean, onPress: () => void, key: string) => (
    <TouchableOpacity
      key={key}
      style={[styles.chip, { borderColor: active ? colors.primary : colors.border }]}
      onPress={onPress}
      accessibilityLabel={label}
    >
      <Text style={{ color: active ? colors.primary : colors.textSecondary }}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <ScrollView style={[styles.root, { backgroundColor: colors.background }]} contentContainerStyle={styles.content}>
      <Text style={[styles.heading, { color: colors.text }]}>听书设置</Text>

      <Text style={[styles.label, { color: colors.textSecondary }]}>听书通道</Text>
      <View style={styles.chipRow}>
        {chip('本地离线 TTS', settings.tts.channel === 'local', () => onSelectChannel('local'), 'local')}
        {chip('云端 TTS', settings.tts.channel === 'cloud', () => onSelectChannel('cloud'), 'cloud')}
      </View>

      <Text style={[styles.label, { color: colors.textSecondary }]}>语速</Text>
      <View style={styles.chipRow}>
        {[0.5, 0.75, 1, 1.25, 1.5, 2].map((rate) =>
          chip(`${rate}x`, settings.tts.rate === rate, () => setRate(rate), `rate-${rate}`),
        )}
      </View>

      <Text style={[styles.label, { color: colors.textSecondary }]}>阅读主题</Text>
      <View style={styles.chipRow}>
        {(['light', 'dark'] as Theme[]).map((theme) =>
          chip(theme === 'light' ? '日间' : '夜间', settings.reader.theme === theme, () =>
            updateReader({ theme }),
          `theme-${theme}`),
        )}
      </View>

      <Text style={[styles.label, { color: colors.textSecondary }]}>字号</Text>
      <View style={styles.chipRow}>
        {[16, 18, 20, 24, 28].map((size) =>
          chip(String(size), settings.reader.fontSize === size, () =>
            updateReader({ fontSize: size }),
          `font-${size}`),
        )}
      </View>

      <View style={styles.switchRow}>
        <Text style={{ color: colors.text }}>章末自动续播下一章</Text>
        <Switch
          value={settings.tts.autoNextChapter}
          onValueChange={setAutoNextChapter}
          accessibilityLabel="章末自动续播下一章"
        />
      </View>

      <View style={styles.switchRow}>
        <Text style={[styles.switchText, { color: colors.text }]}>允许云端朗读</Text>
        <Switch
          value={settings.tts.cloudConsent}
          onValueChange={(value) => (value ? onEnableCloud() : onDisableCloud())}
          accessibilityLabel="允许云端朗读"
        />
      </View>
      <Text style={[styles.hint, { color: colors.textSecondary }]}>{CLOUD_TTS_NOTICE}</Text>

      <ErrorBanner message={ttsError} onDismiss={clearError} />

      <Text style={[styles.heading, { color: colors.text }]}>关于 / 合规声明</Text>
      <Text style={[styles.body, { color: colors.text }]}>{COMPLIANCE_STATEMENT}</Text>
      <Text style={[styles.hint, { color: colors.textSecondary }]}>
        当前版本 v1.0 · 当前通道 {ttsState.channel === 'cloud' ? '云端 TTS' : '本地离线 TTS'}
      </Text>

      <CloudConsentModal
        visible={showConsent}
        onAgree={onEnableCloud}
        onDecline={() => {
          setShowConsent(false);
          setChannel('local');
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 18, paddingTop: 54, paddingBottom: 40 },
  heading: { fontSize: 18, fontWeight: '700', marginTop: 18, marginBottom: 10 },
  label: { fontSize: 13, marginTop: 18, marginBottom: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap' },
  chip: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7, marginRight: 8, marginBottom: 6 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 20 },
  switchText: { flex: 1, marginRight: 12 },
  hint: { fontSize: 12, lineHeight: 18, marginTop: 8 },
  body: { fontSize: 14, lineHeight: 22 },
});
