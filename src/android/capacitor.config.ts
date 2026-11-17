import type { CapacitorConfig } from '@capacitor/cli';

// M6. appId is permanent for sideload updates (D-11: com.wwweeeiii.howtogo); android/app/build.gradle
// must say the same (scripts/check-appid.mjs fails the build otherwise).
// CAP_SPIKE=1 (debug only) starts on the spike harness instead of the real app.
const spike = process.env.CAP_SPIKE === '1';

const config: CapacitorConfig = {
  appId: 'com.wwweeeiii.howtogo',
  appName: '怎么去',
  webDir: '../web/dist',
  android: {
    // The web build is served from https://localhost (default scheme). Inspectable only in spike/debug runs.
    webContentsDebuggingEnabled: spike,
    allowMixedContent: false,
  },
  server: spike ? { appStartPath: '/spike.html' } : {},
};

export default config;
