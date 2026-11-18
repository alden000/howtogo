export * from './types';
export { createWebPlatform } from './web';
// The fake/demo platform is loaded on demand (main.tsx, demo mode only; M5 AC 3): types only here.
export type { FakePlatform, FakeControls } from './fake';
