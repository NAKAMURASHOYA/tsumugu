const { getDefaultConfig } = require('expo/metro-config');
const { withSkiaMetroConfig } = require('@shopify/react-native-skia/metro');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Skia の .sksl シェーダーファイルを Metro に認識させる
module.exports = withSkiaMetroConfig(config);
