import type { CapacitorConfig } from '@capacitor/cli';

// M6 spike. appId is a placeholder until the Director confirms it.
// CAP_SPIKE=1 starts on the spike harness (spike/spike.html, copied in by scripts/sync.mjs)
// instead of the real app; both ship in the same assets folder.
const spike = process.env.CAP_SPIKE === '1';

const config: CapacitorConfig = {
  appId: 'sg.howtogo.app',
  appName: '怎么去',
  webDir: '../web/dist',
  android: {
    // The web build is served from https://localhost; keep the default scheme.
    webContentsDebuggingEnabled: true,
  },
  server: spike ? { appStartPath: '/spike.html' } : {},
  plugins: {
    LocalNotifications: { smallIcon: 'ic_stat_trip', iconColor: '#9A3412' },
  },
};

export default config;
