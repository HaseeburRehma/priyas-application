module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // Reanimated MUST be listed LAST — the docs are explicit about this.
      // https://docs.swmansion.com/react-native-reanimated/docs/fundamentals/getting-started/#babel-plugin
      'react-native-reanimated/plugin',
    ],
  };
};
