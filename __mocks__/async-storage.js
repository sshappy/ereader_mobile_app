/* AsyncStorage 手动 mock：内存实现，测试中不落盘。 */
const store = new Map();

const asyncStorage = {
  getItem: jest.fn(async (key) => (store.has(key) ? store.get(key) : null)),
  setItem: jest.fn(async (key, value) => {
    store.set(key, value);
  }),
  removeItem: jest.fn(async (key) => {
    store.delete(key);
  }),
  getAllKeys: jest.fn(async () => Array.from(store.keys())),
  multiGet: jest.fn(async (keys) => keys.map((key) => [key, store.get(key) ?? null])),
  multiSet: jest.fn(async (entries) => {
    entries.forEach(([key, value]) => store.set(key, value));
  }),
  clear: jest.fn(async () => store.clear()),
  __store: store,
};

module.exports = asyncStorage;
module.exports.default = asyncStorage;
