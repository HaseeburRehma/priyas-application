// Metro config for the Expo Router mobile app.
//
// Starts from the default Expo preset, then explicitly wires up the
// `@/*` → `./src/*` path alias declared in `tsconfig.json`. `app.json`
// already sets `expo.experiments.tsconfigPaths: true`, which is enough
// for `expo start` / development builds — but `expo export:embed
// --eager` (the command EAS runs during production builds) doesn't
// always honor the experiment flag in every SDK 52 point release, and
// silently fails with `Unable to resolve module @/lib/…`. This
// explicit resolveRequest wrapper is the belt-and-suspenders fix.

const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === '@' || moduleName.startsWith('@/')) {
    const rest = moduleName === '@' ? '' : moduleName.slice(2);
    const target = path.resolve(__dirname, 'src', rest);
    return context.resolveRequest(context, target, platform);
  }
  return originalResolveRequest
    ? originalResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
