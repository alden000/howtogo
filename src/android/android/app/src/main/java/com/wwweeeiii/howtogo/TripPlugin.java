package com.wwweeeiii.howtogo;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.provider.Settings;
import android.speech.tts.TextToSpeech;
import android.util.Log;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.google.android.gms.location.CurrentLocationRequest;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;
import org.json.JSONObject;

/**
 * "Trip" plugin: the native half of the platform adapter (src/web/src/platform/native.ts).
 * Location (one-shot + the trip FGS), per-leg profile, native backup alerts with JS dedupe, TTS,
 * haptics, notifications, permissions, share sheet, OEM battery guide status and settings shortcuts.
 */
@CapacitorPlugin(
    name = "Trip",
    permissions = {
        @Permission(alias = "location", strings = { Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION }),
        @Permission(alias = "notifications", strings = { "android.permission.POST_NOTIFICATIONS" })
    }
)
public class TripPlugin extends Plugin implements TripService.Listener {
    static final String TAG = TripService.TAG;
    private boolean killedChecked = false;
    private boolean lastTripKilled = false;

    @Override
    public void load() {
        TripService.listener = this;
        Cues.createChannels(getContext(), Cues.channelLang(getContext()));
        // A trip flag still set while no service runs = the process died during the last trip (AC 30).
        if (!TripService.running) {
            lastTripKilled = getContext().getSharedPreferences(TripService.PREFS, Context.MODE_PRIVATE).getBoolean(TripService.PREF_ACTIVE, false);
            getContext().getSharedPreferences(TripService.PREFS, Context.MODE_PRIVATE).edit().putBoolean(TripService.PREF_ACTIVE, false).apply();
        }
    }

    // ------------------------------------------------------------ intents from MainActivity
    void handleIntent(Intent i) {
        if (i == null || i.getAction() == null) return;
        if (Cues.ACTION_OPEN_STOP.equals(i.getAction())) {
            Log.i(TAG, "trip:stop-requested");
            // retain: delivered once JS listens (cold start from the notification).
            notifyListeners("stopRequested", new JSObject(), true);
        }
    }

    // ------------------------------------------------------------ permissions
    private String notifState() {
        if (Build.VERSION.SDK_INT >= 33) return getPermissionState("notifications").toString();
        return NotificationManagerCompat.from(getContext()).areNotificationsEnabled() ? "granted" : "denied";
    }

    private JSObject permStates() {
        JSObject r = new JSObject();
        r.put("location", getPermissionState("location").toString());
        r.put("notifications", notifState());
        return r;
    }

    @PluginMethod
    public void checkTripPermissions(PluginCall call) {
        call.resolve(permStates());
    }

    /** which: ["location"] or ["notifications"] (each asked from its own explainer). */
    @PluginMethod
    public void requestTripPermissions(PluginCall call) {
        JSArray which = call.getArray("which", new JSArray());
        List<String> aliases = new ArrayList<>();
        for (int k = 0; k < which.length(); k++) {
            String a = which.optString(k);
            if ("notifications".equals(a) && Build.VERSION.SDK_INT < 33) continue;
            if ("location".equals(a) || "notifications".equals(a)) aliases.add(a);
        }
        if (aliases.isEmpty()) {
            call.resolve(permStates());
            return;
        }
        requestPermissionForAliases(aliases.toArray(new String[0]), call, "permsDone");
    }

    @PermissionCallback
    private void permsDone(PluginCall call) {
        call.resolve(permStates());
    }

    // ------------------------------------------------------------ location
    private static JSObject toFix(Location l) {
        JSObject f = new JSObject();
        f.put("lat", l.getLatitude());
        f.put("lng", l.getLongitude());
        f.put("acc", l.hasAccuracy() ? l.getAccuracy() : 999);
        if (l.hasBearing()) f.put("heading", l.getBearing());
        if (l.hasSpeed()) f.put("speed", l.getSpeed());
        f.put("t", l.getTime());
        return f;
    }

    /** One-shot fix for search / route planning: no service (AC 7). */
    @SuppressLint("MissingPermission")
    @PluginMethod
    public void current(PluginCall call) {
        if (getPermissionState("location") != PermissionState.GRANTED) {
            call.reject("location permission not granted", "denied");
            return;
        }
        boolean high = call.getBoolean("highAccuracy", true);
        long timeout = call.getLong("timeoutMs", 15000L);
        AtomicBoolean done = new AtomicBoolean(false);
        Handler h = new Handler(Looper.getMainLooper());
        h.postDelayed(() -> {
            if (done.compareAndSet(false, true)) call.reject("timeout", "timeout");
        }, timeout);
        if (TripService.hasPlayServices(getContext())) {
            CurrentLocationRequest req = new CurrentLocationRequest.Builder()
                .setPriority(high ? Priority.PRIORITY_HIGH_ACCURACY : Priority.PRIORITY_BALANCED_POWER_ACCURACY)
                .setMaxUpdateAgeMillis(10000L)
                .setDurationMillis(timeout)
                .build();
            LocationServices.getFusedLocationProviderClient(getContext()).getCurrentLocation(req, null)
                .addOnSuccessListener(l -> {
                    if (!done.compareAndSet(false, true)) return;
                    if (l == null) call.reject("no fix", "unavailable");
                    else call.resolve(toFix(l));
                })
                .addOnFailureListener(e -> {
                    if (done.compareAndSet(false, true)) call.reject("no fix", "unavailable");
                });
            return;
        }
        // No Play services: LocationManager, first fix from GPS or network (AC 14).
        LocationManager lm = (LocationManager) getContext().getSystemService(Context.LOCATION_SERVICE);
        List<String> ps = TripLogic.fallbackProviders(
            lm.isProviderEnabled(LocationManager.GPS_PROVIDER), lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER),
            high ? TripLogic.PRIORITY_HIGH_ACCURACY : TripLogic.PRIORITY_BALANCED);
        if (ps.isEmpty()) {
            if (done.compareAndSet(false, true)) call.reject("location off", "unavailable");
            return;
        }
        LocationListener one = new LocationListener() {
            @Override
            public void onLocationChanged(Location l) {
                lm.removeUpdates(this);
                if (done.compareAndSet(false, true)) call.resolve(toFix(l));
            }

            @Override
            public void onStatusChanged(String p, int s, android.os.Bundle b) {}

            @Override
            public void onProviderEnabled(String p) {}

            @Override
            public void onProviderDisabled(String p) {}
        };
        for (String p : ps) lm.requestLocationUpdates(p, 1000L, 0f, one, Looper.getMainLooper());
        h.postDelayed(() -> lm.removeUpdates(one), timeout + 100);
    }

    /** Must be called while the activity is visible (Android 12+ FGS start restriction): the Start tap. */
    @PluginMethod
    public void start(PluginCall call) {
        if (getPermissionState("location") != PermissionState.GRANTED) {
            call.reject("location permission not granted", "denied");
            return;
        }
        Intent i = new Intent(getContext(), TripService.class).setAction(TripService.ACTION_START);
        i.putExtra("leg", call.getString("leg", "walk"));
        i.putExtra("title", call.getString("title", ""));
        i.putExtra("body", call.getString("body", ""));
        i.putExtra("stopLabel", call.getString("stopLabel", "结束"));
        i.putExtra("lang", call.getString("lang", "zh-CN"));
        try {
            ContextCompat.startForegroundService(getContext(), i);
            call.resolve();
        } catch (Exception e) {
            // ForegroundServiceStartNotAllowedException (31+) or SecurityException (34+)
            Log.w(TAG, "trip:service-refused");
            call.reject("could not start trip service", "unavailable");
        }
    }

    @PluginMethod
    public void setLeg(PluginCall call) {
        Intent i = new Intent(getContext(), TripService.class).setAction(TripService.ACTION_LEG);
        i.putExtra("leg", call.getString("leg", "walk"));
        Integer sl = call.getInt("stopsLeft");
        i.putExtra("stopsLeft", sl == null ? -1 : sl);
        i.putExtra("lowBattery", call.getBoolean("lowBattery", false));
        if (call.getString("body") != null) i.putExtra("body", call.getString("body"));
        if (call.getString("title") != null) i.putExtra("title", call.getString("title"));
        if (call.getString("lang") != null) i.putExtra("lang", call.getString("lang"));
        sendIfRunning(i);
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        getContext().stopService(new Intent(getContext(), TripService.class));
        call.resolve();
    }

    private void sendIfRunning(Intent i) {
        if (!TripService.running) return;
        try {
            getContext().startService(i);
        } catch (Exception e) {
            Log.w(TAG, "trip:intent-refused");
        }
    }

    // ------------------------------------------------------------ native backup alerts (AC 17–19)
    @PluginMethod
    public void arm(PluginCall call) {
        JSArray arr = call.getArray("alerts", new JSArray());
        List<TripLogic.Alert> list = new ArrayList<>();
        for (int k = 0; k < arr.length(); k++) {
            JSONObject o = arr.optJSONObject(k);
            if (o == null) continue;
            list.add(new TripLogic.Alert(o.optString("id"), o.optString("kind", "next"), o.optDouble("lat"), o.optDouble("lng"),
                (float) o.optDouble("radiusM", 150), o.optString("title"), o.optString("body"), o.optString("speak"), o.optString("lang", "zh-CN")));
        }
        TripService.BOOK.arm(list);
        Log.i(TAG, "alert:armed " + list.size());
        call.resolve();
    }

    @PluginMethod
    public void disarm(PluginCall call) {
        TripService.BOOK.disarm();
        call.resolve();
    }

    /** JS fired first: the service skips this id. */
    @PluginMethod
    public void markFired(PluginCall call) {
        String id = call.getString("id");
        if (id != null) TripService.BOOK.markFired(id);
        call.resolve();
    }

    @PluginMethod
    public void ack(PluginCall call) {
        String id = call.getString("id");
        if (id != null && TripService.BOOK.ack(id)) {
            ((NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE)).cancel(Cues.ID_ALERT);
        }
        call.resolve();
    }

    // ------------------------------------------------------------ speech, haptics, notify
    @PluginMethod
    public void speak(PluginCall call) {
        Speaker.get(getContext()).speak(call.getString("text", ""), call.getString("lang", "zh-CN"), call.getBoolean("flush", false), ok -> {
            JSObject r = new JSObject();
            r.put("spoken", ok);
            call.resolve(r);
        });
    }

    @PluginMethod
    public void stopSpeaking(PluginCall call) {
        Speaker.get(getContext()).stop();
        call.resolve();
    }

    @PluginMethod
    public void voices(PluginCall call) {
        Speaker.get(getContext()).voices((zh, en) -> {
            JSObject r = new JSObject();
            r.put("zh", zh);
            r.put("en", en);
            call.resolve(r);
        });
    }

    @PluginMethod
    public void vibrate(PluginCall call) {
        Cues.vibrate(getContext(), call.getString("name", ""));
        call.resolve();
    }

    /** priority high → the alerts channel (lock screen, getoff buzz); others → info. */
    @PluginMethod
    public void notify(PluginCall call) {
        Context c = getContext();
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        String title = call.getString("title", ""), body = call.getString("body", "");
        String lang = call.getString("lang", "zh-CN"), kind = call.getString("kind", "");
        Cues.createChannels(c, lang);
        if ("high".equals(call.getString("priority"))) {
            nm.notify(Cues.ID_ALERT, Cues.alert(c, call.getString("alertId", ""), title, body, lang));
        } else {
            nm.notify(Cues.ID_INFO, Cues.info(c, kind, title, body, lang));
            // 6h.7: off-route uses the gentle pattern (getoff stays unique to get-off alerts, D21).
            if ("offroute".equals(kind)) Cues.vibrate(c, "gentle");
        }
        call.resolve();
    }

    @PluginMethod
    public void share(PluginCall call) {
        String text = (call.getString("text", "") + " " + call.getString("url", "")).trim();
        Intent send = new Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text);
        Intent chooser = Intent.createChooser(send, null).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getContext().startActivity(chooser);
            JSObject r = new JSObject();
            r.put("outcome", "shared");
            call.resolve(r);
        } catch (Exception e) {
            call.reject("no share target", "unavailable");
        }
    }

    // ------------------------------------------------------------ device: battery guide, settings
    @PluginMethod
    public void deviceInfo(PluginCall call) {
        Context c = getContext();
        PowerManager pm = (PowerManager) c.getSystemService(Context.POWER_SERVICE);
        JSObject r = new JSObject();
        r.put("manufacturer", Build.MANUFACTURER == null ? "" : Build.MANUFACTURER);
        r.put("brand", Build.BRAND == null ? "" : Build.BRAND);
        r.put("sdk", Build.VERSION.SDK_INT);
        // Status only (AC 29); we never request REQUEST_IGNORE_BATTERY_OPTIMIZATIONS.
        r.put("batteryUnrestricted", Build.VERSION.SDK_INT < 23 || (pm != null && pm.isIgnoringBatteryOptimizations(c.getPackageName())));
        r.put("playServices", TripService.hasPlayServices(c));
        r.put("tripRunning", TripService.running);
        // M6 UI (6h.2 A3/A4): precise vs approximate, and "don't ask again" (Capacitor reports DENIED only then).
        r.put("fineLocation", ContextCompat.checkSelfPermission(c, Manifest.permission.ACCESS_FINE_LOCATION) == android.content.pm.PackageManager.PERMISSION_GRANTED);
        r.put("coarseLocation", ContextCompat.checkSelfPermission(c, Manifest.permission.ACCESS_COARSE_LOCATION) == android.content.pm.PackageManager.PERMISSION_GRANTED);
        r.put("locationState", getPermissionState("location").toString());
        // 6h.3 A5/A6: notifications on at all, and whether Do Not Disturb would silence get-off alerts.
        r.put("notificationsEnabled", NotificationManagerCompat.from(c).areNotificationsEnabled());
        r.put("dndBlocks", dndBlocks(c));
        // 6h.8 D1: the installed version, compared with /android/latest.json.
        try {
            android.content.pm.PackageInfo pi = c.getPackageManager().getPackageInfo(c.getPackageName(), 0);
            r.put("versionName", pi.versionName == null ? "" : pi.versionName);
            r.put("versionCode", Build.VERSION.SDK_INT >= 28 ? pi.getLongVersionCode() : (long) pi.versionCode);
        } catch (Exception e) {
            r.put("versionName", "");
            r.put("versionCode", 0);
        }
        if (!killedChecked) {
            killedChecked = true;
            r.put("lastTripKilled", lastTripKilled);
        } else {
            r.put("lastTripKilled", false);
        }
        call.resolve(r);
    }

    /** DND is on (anything but "all") and the alerts channel may not bypass it. */
    static boolean dndBlocks(Context c) {
        if (Build.VERSION.SDK_INT < 26) return false;
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm == null) return false;
        int f = nm.getCurrentInterruptionFilter();
        if (f == NotificationManager.INTERRUPTION_FILTER_ALL || f == NotificationManager.INTERRUPTION_FILTER_UNKNOWN) return false;
        android.app.NotificationChannel ch = nm.getNotificationChannel(Cues.CH_ALERT);
        return ch == null || !ch.canBypassDnd();
    }

    /**
     * 6h.8 D1 / 6h.6 C2: open a page in the external browser (the APK download must reach the system installer)
     * or a store page. Only https: and market: URLs.
     */
    @PluginMethod
    public void openUrl(PluginCall call) {
        String url = call.getString("url", "");
        if (!(url.startsWith("https://") || url.startsWith("market://"))) {
            call.reject("unsupported url", "unsupported");
            return;
        }
        try {
            Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getActivity().startActivity(i);
            call.resolve();
        } catch (Exception e) {
            call.reject("no app for url", "unavailable");
        }
    }

    /** target: app | battery | notifications | alerts-channel | tts-install */
    @PluginMethod
    public void openSettings(PluginCall call) {
        Context c = getContext();
        String target = call.getString("target", "app");
        Intent app = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", c.getPackageName(), null));
        Intent i;
        switch (target) {
            case "battery":
                i = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
                break;
            case "notifications":
                i = Build.VERSION.SDK_INT >= 26
                    ? new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, c.getPackageName())
                    : app;
                break;
            case "alerts-channel":
                i = Build.VERSION.SDK_INT >= 26
                    ? new Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS)
                        .putExtra(Settings.EXTRA_APP_PACKAGE, c.getPackageName())
                        .putExtra(Settings.EXTRA_CHANNEL_ID, Cues.CH_ALERT)
                    : app;
                break;
            case "tts-install":
                i = new Intent(TextToSpeech.Engine.ACTION_INSTALL_TTS_DATA);
                break;
            default:
                i = app;
        }
        JSObject r = new JSObject();
        try {
            getActivity().startActivity(i);
            r.put("opened", target);
        } catch (Exception e) {
            try {
                getActivity().startActivity(app); // fallback: app details
                r.put("opened", "app");
            } catch (Exception e2) {
                r.put("opened", "none");
            }
        }
        call.resolve(r);
    }

    // ------------------------------------------------------------ TripService.Listener (main thread)
    @Override
    public void onFix(Location l) {
        notifyListeners("fix", toFix(l));
    }

    @Override
    public void onAlert(String id, String kind, String type) {
        JSObject o = new JSObject();
        o.put("id", id);
        o.put("kind", kind);
        o.put("type", type);
        notifyListeners("alert", o, true);
    }
}
