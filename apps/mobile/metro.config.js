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

// NOTE on duplicate react: the repo root has its own node_modules with
// react@18 for the Next.js web app. Metro's default nearest-wins
// resolution correctly picks mobile's local react@19 for everything the
// mobile bundle imports, so the duplicate is benign at bundle time.
// expo-doctor still warns about it via a filesystem scan — see the
// known-warnings note in the mobile README (or CLAUDE.md) if it comes
// up again. Do not override resolver.nodeModulesPaths or disable
// hierarchical lookup here; both cause more problems than they solve.

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
