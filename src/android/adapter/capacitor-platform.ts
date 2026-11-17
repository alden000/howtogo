/**
 * M6 spike sketch (not wired into the web build yet): the native `Platform`
 * (director ruling D-4) as overrides on top of the web implementation.
 * In M6 proper this moves to src/web/src/platform/native.ts and main.tsx picks
 * it when `Capacitor.isNativePlatform()`.
 */
import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { App } from '@capacitor/app';
import { TextToSpeech, QueueStrategy } from '@capacitor-community/text-to-speech';
import { LocalNotifications } from '@capacitor/local-notifications';
import type { LocationFix, Platform, PlatformError, WatchOptions } from '../../web/src/platform/types';
import { VIBRATE_PATTERNS } from '../../web/src/platform/types';

interface TripPlugin {
  requestTripPermissions(): Promise<{ location: string; notifications: string }>;
  checkTripPermissions(): Promise<{ location: string; notifications: string }>;
  start(o: { intervalMs: number; title: string; body: string; stopLabel: string }): Promise<void>;
  setInterval(o: { intervalMs: number }): Promise<void>;
  updateNotification(o: { title?: string; body?: string }): Promise<void>;
  armAlert(o: { lat: number; lng: number; radiusM: number; title: string; body: string; speak: string; lang: string }): Promise<void>;
  stop(): Promise<void>;
  addListener(ev: 'fix', cb: (f: LocationFix) => void): Promise<PluginListenerHandle>;
  addListener(ev: 'stopped', cb: (e: { reason: string }) => void): Promise<PluginListenerHandle>;
  addListener(ev: 'alertFired', cb: () => void): Promise<PluginListenerHandle>;
}
export const Trip = registerPlugin<TripPlugin>('Trip');

export const isNative = () => Capacitor.isNativePlatform();

export function createNativePlatform(web: Platform): Platform {
  let muted = false;
  let channel: Promise<void> | null = null;
  const ensureChannel = () =>
    (channel ??= LocalNotifications.createChannel({
      id: 'getoff', name: '下车提醒 / Get-off alerts', importance: 5, visibility: 1, vibration: true,
    }));

  return {
    ...web,
    kind: 'native',
    location: {
      async permission() {
        const s = (await Trip.checkTripPermissions()).location;
        return s === 'granted' ? 'granted' : s === 'denied' ? 'denied' : 'prompt';
      },
      current: (o?: WatchOptions) => web.location.current(o), // WebView geolocation is fine in the foreground
      async watch(onFix, onError?: (e: PlatformError) => void, opts?: WatchOptions) {
        // One watcher == one trip: the FGS (and its ongoing notification) lives exactly as long as it.
        const h = await Trip.addListener('fix', onFix);
        try {
          await Trip.start({ intervalMs: opts?.intervalMs ?? 5000, title: '行程进行中 / Trip in progress', body: '', stopLabel: '结束 / Stop' });
        } catch (e) {
          await h.remove();
          onError?.({ code: 'unavailable', message: String((e as Error).message) });
          return () => {};
        }
        return () => { void h.remove(); void Trip.stop(); };
      },
    },
    speech: {
      async voices() {
        const zh = (await TextToSpeech.isLanguageSupported({ lang: 'zh-CN' })).supported;
        const en = (await TextToSpeech.isLanguageSupported({ lang: 'en-SG' })).supported;
        return { zh, en };
      },
      async speak(text, lang, priority) {
        if (muted) return;
        await TextToSpeech.speak({ text, lang, rate: 0.9, queueStrategy: priority === 'high' ? QueueStrategy.Flush : QueueStrategy.Add });
      },
      cancel: () => TextToSpeech.stop(),
      setMuted(m) { muted = m; if (m) void TextToSpeech.stop(); },
    },
    // The FGS keeps the process (and the WebView) alive; the screen may sleep. Keep the web wake lock for the visible guide screen.
    wakeLock: web.wakeLock,
    async vibrate(p) {
      // M6: native Vibrator via a Trip method; navigator.vibrate is unreliable while hidden.
      navigator.vibrate?.(VIBRATE_PATTERNS[p]);
    },
    async notify(cue) {
      await ensureChannel();
      await LocalNotifications.schedule({
        notifications: [{ id: hash(cue.tag), channelId: cue.priority === 'high' ? 'getoff' : 'default', title: cue.title, body: cue.body, smallIcon: 'ic_stat_trip' }],
      });
    },
  };
}

/** System Back → in-app history (process §7). depth = the router's stack depth. */
export function wireBack(getDepth: () => number, onBack: () => void) {
  void App.addListener('backButton', () => { if (getDepth() > 0) onBack(); });
  // Call after every navigation: at depth 0 the system owns Back (predictive back-to-home).
  return (depth: number) => void App.toggleBackButtonHandler({ enabled: depth > 0 });
}

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h) % 100000;
}
