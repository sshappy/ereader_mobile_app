import React from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import {
  CANCEL_LABEL,
  CLOUD_TTS_CONSENT_TITLE,
  CLOUD_TTS_NOTICE,
} from '../constants/compliance';
import { useTheme } from '../theme/ThemeContext';

export interface CloudConsentModalProps {
  visible: boolean;
  onAgree(): void;
  onDecline(): void;
}

/** 云端朗读首次使用告知；取消则回退本地 TTS。 */
export function CloudConsentModal({
  visible,
  onAgree,
  onDecline,
}: CloudConsentModalProps): React.ReactElement {
  const { colors } = useTheme();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDecline}
      accessibilityLabel={CLOUD_TTS_CONSENT_TITLE}
    >
      <View style={[styles.overlay, { backgroundColor: colors.overlay }]}>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={[styles.title, { color: colors.text }]}>{CLOUD_TTS_CONSENT_TITLE}</Text>
          <Text style={[styles.body, { color: colors.text }]}>{CLOUD_TTS_NOTICE}</Text>
          <Text style={[styles.hint, { color: colors.textSecondary }]}>
            不同意时将使用本地离线 TTS，朗读内容不会上传。
          </Text>
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.button, { borderColor: colors.border }]}
              onPress={onDecline}
              accessibilityLabel={CANCEL_LABEL}
            >
              <Text style={{ color: colors.textSecondary }}>{CANCEL_LABEL}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, { backgroundColor: colors.primary }]}
              onPress={onAgree}
              accessibilityLabel="同意并继续"
            >
              <Text style={styles.confirmText}>同意并继续</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', borderRadius: 12, padding: 20 },
  title: { fontSize: 18, fontWeight: '700', textAlign: 'center', marginBottom: 12 },
  body: { fontSize: 15, lineHeight: 24 },
  hint: { fontSize: 13, lineHeight: 20, marginTop: 10 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 20 },
  button: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 6, marginLeft: 10, borderWidth: 1 },
  confirmText: { color: '#FFFFFF', fontWeight: '600' },
});
