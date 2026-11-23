import React from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import {
  CANCEL_LABEL,
  COMPLIANCE_STATEMENT,
  COMPLIANCE_TITLE,
  CONFIRM_LABEL,
} from '../constants/compliance';
import { useTheme } from '../theme/ThemeContext';

export interface ComplianceModalProps {
  visible: boolean;
  onConfirm(): void;
  onCancel(): void;
}

/** 导入前强制合规声明（R-02），文案使用 PRD 原文，不得改写。 */
export function ComplianceModal({
  visible,
  onConfirm,
  onCancel,
}: ComplianceModalProps): React.ReactElement {
  const { colors } = useTheme();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
      accessibilityLabel={COMPLIANCE_TITLE}
    >
      <View style={[styles.overlay, { backgroundColor: colors.overlay }]}>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={[styles.title, { color: colors.text }]}>{COMPLIANCE_TITLE}</Text>
          <Text style={[styles.body, { color: colors.text }]}>{COMPLIANCE_STATEMENT}</Text>
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.button, { borderColor: colors.border }]}
              onPress={onCancel}
              accessibilityLabel={CANCEL_LABEL}
            >
              <Text style={{ color: colors.textSecondary }}>{CANCEL_LABEL}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, { backgroundColor: colors.primary }]}
              onPress={onConfirm}
              accessibilityLabel={CONFIRM_LABEL}
            >
              <Text style={styles.confirmText}>{CONFIRM_LABEL}</Text>
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
  actions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 20 },
  button: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 6, marginLeft: 10, borderWidth: 1 },
  confirmText: { color: '#FFFFFF', fontWeight: '600' },
});
