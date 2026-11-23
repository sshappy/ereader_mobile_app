/* react-native-sound 手动 mock：不访问真实音频文件。 */
class MockSound {
  constructor(uri) {
    this.uri = uri;
    this.rate = 1;
  }

  setVolume() {}

  setRate(value) {
    this.rate = value;
  }

  play(callback) {
    if (typeof callback === 'function') {
      callback(false);
    }
  }

  pause() {}

  resume() {}

  stop(callback) {
    if (typeof callback === 'function') {
      callback();
    }
  }

  release() {}
}

MockSound.setCategory = jest.fn();

module.exports = MockSound;
module.exports.default = MockSound;
