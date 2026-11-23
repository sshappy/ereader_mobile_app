/* RNFS 手动 mock：测试中不访问真实文件系统。 */
const fs = {
  DocumentDirectoryPath: '/mock/documents',
  CachesDirectoryPath: '/mock/caches',
  TemporaryDirectoryPath: '/mock/temp',
  exists: jest.fn(async () => true),
  mkdir: jest.fn(async () => undefined),
  readFile: jest.fn(async () => ''),
  writeFile: jest.fn(async () => undefined),
  copyFile: jest.fn(async () => undefined),
  moveFile: jest.fn(async () => undefined),
  unlink: jest.fn(async () => undefined),
  stat: jest.fn(async () => ({ size: 1024 })),
  readDir: jest.fn(async () => []),
};

module.exports = fs;
module.exports.default = fs;
