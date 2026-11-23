import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { PlayerScreen } from '../screens/PlayerScreen';
import { ReaderScreen } from '../screens/ReaderScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { ShelfScreen } from '../screens/ShelfScreen';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

/** Shelf → Reader → Player 主栈；Settings 以 Modal 形式呈现。 */
export function AppNavigator(): React.ReactElement {
  return (
    <Stack.Navigator initialRouteName="Shelf">
      <Stack.Screen
        name="Shelf"
        component={ShelfScreen}
        options={{ title: '书架', headerShown: false }}
      />
      <Stack.Screen
        name="Reader"
        component={ReaderScreen}
        options={{ title: '阅读', headerShown: false }}
      />
      <Stack.Screen
        name="Player"
        component={PlayerScreen}
        options={{ title: '听书', headerShown: false }}
      />
      <Stack.Group screenOptions={{ presentation: 'modal' }}>
        <Stack.Screen
          name="Settings"
          component={SettingsScreen}
          options={{ title: '设置' }}
        />
      </Stack.Group>
    </Stack.Navigator>
  );
}
