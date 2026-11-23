/* react-native-tts 手动 mock：不调用系统语音引擎。 */
const listeners = Object.create(null);

const tts = {
  getInitStatus: jest.fn(async () => 'ready'),
  getVoices: jest.fn(async () => [
    { id: 'zh-CN-default', name: 'Chinese', language: 'zh-CN' },
    { id: 'en-US-default', name: 'English', language: 'en-US' },
  ]),
  speak: jest.fn(async () => undefined),
  pause: jest.fn(async () => undefined),
  resume: jest.fn(async () => undefined),
  stop: jest.fn(async () => undefined),
  setRate: jest.fn(async () => undefined),
  setDefaultVoice: jest.fn(async () => undefined),
  addEventListener: jest.fn((event, handler) => {
    listeners[event] = listeners[event] || [];
    listeners[event].push(handler);
  }),
  removeEventListener: jest.fn((event, handler) => {
    listeners[event] = (listeners[event] || []).filter((item) => item !== handler);
  }),
  emit: jest.fn((event, payload) => {
    (listeners[event] || []).forEach((handler) => handler(payload));
  }),
};

module.exports = tts;
module.exports.default = tts;
