/**
 * Jest 配置说明：
 * - 领域层/解析器/分段器/Store 均为纯 JS/TS，测试运行在 node 环境，不依赖模拟器。
 * - 所有原生模块通过 moduleNameMapper 指向 __mocks__，测试中不得触网或访问真实文件系统。
 * - T05 组件测试采用 Store/逻辑级冒烟测试，避免在本机渲染 RN 原生视图。
 */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        // 纯 JS 单测只做转译，避免本机缺少 RN 原生依赖时类型检查阻断测试。
        tsconfig: {
          isolatedModules: true,
          target: 'ES2020',
          module: 'commonjs',
          esModuleInterop: true,
          allowSyntheticDefaultImports: true,
          jsx: 'react-jsx',
        },
      },
    ],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^react-native$': '<rootDir>/__mocks__/react-native.js',
    '^react-native-webview$': '<rootDir>/__mocks__/react-native-webview.js',
    '^react-native-fs$': '<rootDir>/__mocks__/react-native-fs.js',
    '^react-native-document-picker$': '<rootDir>/__mocks__/react-native-document-picker.js',
    '^react-native-tts$': '<rootDir>/__mocks__/react-native-tts.js',
    '^react-native-sound$': '<rootDir>/__mocks__/react-native-sound.js',
    '^@react-native-async-storage/async-storage$': '<rootDir>/__mocks__/async-storage.js',
  },
  clearMocks: true,
  verbose: false,
};
