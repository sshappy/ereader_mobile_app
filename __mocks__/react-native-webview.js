/* WebView 最小 mock：组件级冒烟测试不渲染真实 WebView。 */
const React = require('react');

const WebView = React.forwardRef((props) => React.createElement('WebView', props));
WebView.displayName = 'WebView';

module.exports = WebView;
module.exports.default = WebView;
