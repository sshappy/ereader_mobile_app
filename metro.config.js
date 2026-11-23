const { getDefaultConfig } = require('@react-native/metro-config');

/**
 * Metro 配置：保持 RN 0.74 默认行为，路径别名由 Babel module-resolver 处理。
 * 显式声明扩展名可确保 TS 源文件在真机打包时被解析。
 */
const config = {
  resolver: {
    sourceExts: ['js', 'jsx', 'ts', 'tsx', 'json'],
  },
};

module.exports = getDefaultConfig(__dirname, config);
