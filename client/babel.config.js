module.exports = function(api) {
  api.cache(true);

  // Ensure Expo Router always resolves routes from the top-level app directory.
  if (!process.env.EXPO_ROUTER_APP_ROOT) {
    process.env.EXPO_ROUTER_APP_ROOT = 'app';
  }

  const plugins = [
    ['module:react-native-dotenv', {
      moduleName: '@env',
      path: '.env',
      safe: false,
      allowUndefined: true,
    }],
    ['module-resolver', {
      root: ['./'],
      alias: {
        '@': './',
      },
    }],
    'react-native-reanimated/plugin'
  ];

  // Remove console.log everywhere (keep error/warn); massively improves scroll perf in dev
  if (process.env.NODE_ENV !== 'test') {
    plugins.unshift(['transform-remove-console', { exclude: ['error', 'warn'] }]);
  }

  return {
    presets: ['babel-preset-expo'],
    plugins,
  };
};