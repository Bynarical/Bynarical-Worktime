// Expo 기본 Metro 설정 + React 19/react-native-web 를 위한 package exports 활성화
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// react-dom/client 등 exports 서브패스 해석을 위해 필요
config.resolver.unstable_enablePackageExports = true;

module.exports = config;
