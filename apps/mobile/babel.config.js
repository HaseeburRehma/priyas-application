module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // Reanimated 4 splits worklets into their own package. The babel
      // plugin moved from 'react-native-reanimated/plugin' to
      // 'react-native-worklets/plugin' and MUST still be listed LAST.
      // https://docs.swmansion.com/react-native-reanimated/docs/fundamentals/getting-started/#babel-plugin
      'react-native-worklets/plugin',
    ],
  };
};
