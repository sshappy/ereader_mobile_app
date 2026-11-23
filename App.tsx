import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaView, StyleSheet, Text, TouchableOpacity } from 'react-native';

import { AppNavigator } from './src/navigation/AppNavigator';
import { getAppStorage } from './src/store/services';
import { ThemeProvider } from './src/theme/ThemeContext';
import { toUserMessage } from './src/utils/errors';
import { logger } from './src/utils/logger';

interface BoundaryState {
  error: Error | null;
}

/** 全局错误边界：任何未捕获异常都展示可读文案，不暴露堆栈给用户。 */
class AppErrorBoundary extends React.Component<{ children: React.ReactNode }, BoundaryState> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  componentDidCatch(error: Error): void {
    logger.error('应用发生未捕获错误', error);
  }

  render(): React.ReactElement {
    if (this.state.error) {
      return (
        <SafeAreaView style={styles.fallback}>
          <Text style={styles.title}>应用发生错误</Text>
          <Text style={styles.message}>{toUserMessage(this.state.error)}</Text>
          <TouchableOpacity
            style={styles.retry}
            onPress={() => {
              this.setState({ error: null });
              void getAppStorage().getAllKeys().catch(() => undefined);
            }}
            accessibilityLabel="重试"
          >
            <Text style={styles.retryText}>重试</Text>
          </TouchableOpacity>
        </SafeAreaView>
      );
    }
    return <>{this.props.children}</>;
  }
}

/** 应用根组件：错误边界 + 导航容器 + 主题 Provider。 */
export default function App(): React.ReactElement {
  return (
    <AppErrorBoundary>
      <NavigationContainer>
        <ThemeProvider>
          <AppNavigator />
        </ThemeProvider>
      </NavigationContainer>
    </AppErrorBoundary>
  );
}

const styles = StyleSheet.create({
  fallback: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 12 },
  message: { fontSize: 14, textAlign: 'center', lineHeight: 21 },
  retry: { marginTop: 20, backgroundColor: '#4A90E2', borderRadius: 6, paddingHorizontal: 20, paddingVertical: 10 },
  retryText: { color: '#FFFFFF', fontWeight: '600' },
});
