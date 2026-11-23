/* DocumentPicker 手动 mock：测试中不打开系统文件选择器。 */
const picker = {
  types: { allFiles: '*/*', images: 'image/*' },
  isCancel: jest.fn((error) => Boolean(error && error.code === 'DOCUMENT_PICKER_CANCELED')),
  pickSingle: jest.fn(async () => ({
    uri: 'content://mock/sample.epub',
    fileCopyUri: 'file:///mock/caches/sample.epub',
    name: 'sample.epub',
    size: 1024,
    type: 'application/epub+zip',
  })),
  pick: jest.fn(async () => []),
};

module.exports = picker;
module.exports.default = picker;
