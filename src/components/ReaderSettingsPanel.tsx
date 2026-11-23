import React from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useTheme } from '../theme/ThemeContext';
import type { ReaderSettings } from '../types';

export interface ReaderSettingsPanelProps {
  visible: boolean;
  settings: ReaderSettings;
  onChange(patch: Partial<ReaderSettings>): void;
  onClose(): void;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** 阅读设置面板（R-06）：修改即时生效，由 SettingsStore 持久化。 */
export function ReaderSettingsPanel({
  visible,
  settings,
  onChange,
  onClose,
}: ReaderSettingsPanelProps): React.ReactElement {
  const { colors } = useTheme();
  const button = (label: string, onPress: () => void, key: string) => (
    <TouchableOpacity
      key={key}
      style={[styles.chip, { borderColor: colors.border }]}
      onPress={onPress}
      accessibilityLabel={label}
    >
      <Text style={{ color: colors.text }}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={[styles.overlay, { backgroundColor: colors.overlay }]} onTouchEnd={onClose}>
        <View style={[styles.panel, { backgroundColor: colors.surface }]} onTouchEnd={(e) => e.stopPropagation()}>
          <Text style={[styles.title, { color: colors.text }]}>阅读设置</Text>

          <View style={styles.row}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>字号</Text>
            {button('A-', () => onChange({ fontSize: clamp(settings.fontSize - 1, 14, 30) }), 'font-minus')}
            <Text style={[styles.value, { color: colors.text }]}>{settings.fontSize}</Text>
            {button('A+', () => onChange({ fontSize: clamp(settings.fontSize + 1, 14, 30) }), 'font-plus')}
          </View>

          <View style={styles.row}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>行距</Text>
            {button('-', () => onChange({ lineHeight: clamp(settings.lineHeight - 0.1, 1.2, 2) }), 'line-minus')}
            <Text style={[styles.value, { color: colors.text }]}>{settings.lineHeight.toFixed(1)}</Text>
            {button('+', () => onChange({ lineHeight: clamp(settings.lineHeight + 0.1, 1.2, 2) }), 'line-plus')}
          </View>

          <View style={styles.row}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>主题</Text>
            {button('日间', () => onChange({ theme: 'light' }), 'theme-light')}
            {button('夜间', () => onChange({ theme: 'dark' }), 'theme-dark')}
          </View>

          <View style={styles.row}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>翻页</Text>
            {button('上下滚动', () => onChange({ pageMode: 'scroll' }), 'mode-scroll')}
            {button('左右翻页', () => onChange({ pageMode: 'page' }), 'mode-page')}
          </View>

          <TouchableOpacity style={[styles.done, { backgroundColor: colors.primary }]} onPress={onClose}>
            <Text style={styles.doneText}>完成</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  panel: { padding: 20, borderTopLeftRadius: 14, borderTopRightRadius: 14 },
  title: { fontSize: 17, fontWeight: '700', marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', marginVertical: 8 },
  label: { width: 50, fontSize: 14 },
  value: { minWidth: 44, textAlign: 'center', fontSize: 14 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderRadius: 6, marginRight: 8 },
  done: { marginTop: 16, borderRadius: 6, paddingVertical: 12, alignItems: 'center' },
  doneText: { color: '#FFFFFF', fontWeight: '600' },
});
