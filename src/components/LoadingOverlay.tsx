import React from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../theme/ThemeContext';

export interface LoadingOverlayProps {
  visible: boolean;
  message?: string;
}

/** 导入/解析/合成期间的阻塞提示，避免重复点击。 */
export function LoadingOverlay({
  visible,
  message = '正在处理…',
}: LoadingOverlayProps): React.ReactElement {
  const { colors } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={[styles.overlay, { backgroundColor: colors.overlay }]}>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={[styles.text, { color: colors.text }]}>{message}</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { padding: 24, borderRadius: 12, alignItems: 'center', minWidth: 160 },
  text: { marginTop: 12, fontSize: 14 },
});
