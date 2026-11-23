import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';

/** 主栈参数类型：章节索引一律 0-based。 */
export type RootStackParamList = {
  Shelf: undefined;
  Reader: { bookId: string; chapterIndex?: number };
  Player: { bookId: string; chapterIndex: number };
  Settings: undefined;
};

export type ShelfScreenProps = NativeStackScreenProps<RootStackParamList, 'Shelf'>;
export type ReaderScreenProps = NativeStackScreenProps<RootStackParamList, 'Reader'>;
export type PlayerScreenProps = NativeStackScreenProps<RootStackParamList, 'Player'>;
export type SettingsScreenProps = NativeStackScreenProps<RootStackParamList, 'Settings'>;

export type ReaderRouteProp = RouteProp<RootStackParamList, 'Reader'>;
export type PlayerRouteProp = RouteProp<RootStackParamList, 'Player'>;

export type AppNavigationProp = NativeStackNavigationProp<RootStackParamList>;
