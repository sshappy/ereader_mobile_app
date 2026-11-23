/* RN 最小 mock：Store/逻辑测试不需要真实原生视图或能力。 */
const React = require('react');

const hostComponent = (name) => {
  const Component = React.forwardRef((props, _ref) => React.createElement(name, props, props.children));
  Component.displayName = name;
  return Component;
};

const rn = {
  View: hostComponent('View'),
  Text: hostComponent('Text'),
  Image: hostComponent('Image'),
  ScrollView: hostComponent('ScrollView'),
  TouchableOpacity: hostComponent('TouchableOpacity'),
  SafeAreaView: hostComponent('SafeAreaView'),
  Switch: hostComponent('Switch'),
  Modal: hostComponent('Modal'),
  FlatList: hostComponent('FlatList'),
  ActivityIndicator: hostComponent('ActivityIndicator'),
  StyleSheet: { create: (styles) => styles },
  Platform: {
    OS: 'ios',
    Version: '13.0',
    select: (spec) => spec.ios ?? spec.default,
  },
  PermissionsAndroid: {
    PERMISSIONS: { READ_EXTERNAL_STORAGE: 'android.permission.READ_EXTERNAL_STORAGE' },
    RESULTS: { GRANTED: 'granted', DENIED: 'denied' },
    request: jest.fn(async () => 'granted'),
  },
  Alert: { alert: jest.fn() },
  StatusBar: hostComponent('StatusBar'),
};

module.exports = rn;
module.exports.default = rn;
