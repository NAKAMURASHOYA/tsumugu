module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // react-native-reanimated は必ず plugins リストの最後に置くこと（公式要件）
      'react-native-reanimated/plugin',
    ],
  };
};
