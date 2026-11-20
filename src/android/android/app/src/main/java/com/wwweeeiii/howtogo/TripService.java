package com.wwweeeiii.howtogo;

import android.annotation.SuppressLint;
import android.app.Notification;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.IBinder;
import android.os.Looper;
import android.util.Log;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;
import com.google.android.gms.common.ConnectionResult;
import com.google.android.gms.common.GoogleApiAvailabilityLight;
import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.LocationServices;
import java.util.List;

/**
 * Trip foreground service (type location, M6 §C). Runs only between Start (tapped with the app visible)
 * and End / arrival / the notification's Stop path. Fixes go to JS; the native backup get-off alert is
 * checked on every fix inside this service, so it fires even if the WebView's JS is throttled.
 * Logcat (tag howtogo) carries hook names only: no coordinates, places, ids or tokens (AC 37).
 */
public class TripService extends Service {
    interface Listener {
        void onFix(Location l);

        /** type: fired | ack */
        void onAlert(String id, String kind, String type);
    }

    static final String TAG = "howtogo";
    static final String ACTION_START = "com.wwweeeiii.howtogo.trip.START";
    static final String ACTION_LEG = "com.wwweeeiii.howtogo.trip.LEG";
    static final String ACTION_ACK = "com.wwweeeiii.howtogo.trip.ACK";
    static final String ACTION_DISMISS_INFO = "com.wwweeeiii.howtogo.trip.DISMISS_INFO";
    static final String PREFS = "trip";
    static final String PREF_ACTIVE = "active";

    static volatile boolean running = false;
    static volatile Listener listener;
    static final TripLogic.AlertBook BOOK = new TripLogic.AlertBook();

    private FusedLocationProviderClient fused;
    private LocationManager lm;
    private boolean usePlay;
    private String title = "", leg = "walk", lang = "zh-CN";
    private TripLogic.Profile profile = TripLogic.profileFor("walk", null, false);
    private boolean updating = false;
    private long lastFixT = 0;

    private final LocationCallback fusedCb = new LocationCallback() {
        @Override
        public void onLocationResult(@NonNull LocationResult r) {
            Location l = r.getLastLocation();
            if (l != null) onLocation(l);
        }
    };

    private final LocationListener lmCb = new LocationListener() {
        @Override
        public void onLocationChanged(@NonNull Location l) {
            onLocation(l);
        }

        @Override
        public void onStatusChanged(String p, int s, Bundle b) {}

        @Override
        public void onProviderEnabled(@NonNull String p) {}

        @Override
        public void onProviderDisabled(@NonNull String p) {}
    };

    static boolean hasPlayServices(Context ctx) {
        try {
            return GoogleApiAvailabilityLight.getInstance().isGooglePlayServicesAvailable(ctx) == ConnectionResult.SUCCESS;
        } catch (Throwable t) {
            return false;
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        usePlay = hasPlayServices(this);
        if (usePlay) fused = LocationServices.getFusedLocationProviderClient(this);
        lm = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
        Cues.createChannels(this, Cues.channelLang(this));
        Speaker.get(this); // warm up the engine
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : null;
        if (action == null) { // restarted by the system after process death: never resurrect a trip silently
            stopSelf();
            return START_NOT_STICKY;
        }
        switch (action) {
            case ACTION_START:
                title = TripLogic.clip(nz(intent.getStringExtra("title"), ""), 80);
                lang = nz(intent.getStringExtra("lang"), lang);
                leg = nz(intent.getStringExtra("leg"), "walk");
                Cues.createChannels(this, lang);
                profile = TripLogic.profileFor(intent.getStringExtra("leg"), null, false);
                // startForeground within 5 s, with the manifest's type.
                ServiceCompat.startForeground(this, Cues.ID_TRIP, buildOngoing(),
                    Build.VERSION.SDK_INT >= 29 ? ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION : 0);
                if (!running) BOOK.reset();
                running = true;
                prefs().edit().putBoolean(PREF_ACTIVE, true).apply();
                requestUpdates();
                Log.i(TAG, "trip:service-start " + profile + (usePlay ? " fused" : " lm"));
                break;
            case ACTION_LEG: {
                leg = nz(intent.getStringExtra("leg"), "walk");
                int sl = intent.getIntExtra("stopsLeft", -1);
                TripLogic.Profile p = TripLogic.profileFor(leg, sl < 0 ? null : sl, intent.getBooleanExtra("lowBattery", false));
                // 6h.7: title = step short text (web layer, no destination names); text follows the leg kind.
                String tt = intent.getStringExtra("title");
                if (tt == null) tt = intent.getStringExtra("body");
                if (tt != null) title = TripLogic.clip(tt, 80);
                String l = intent.getStringExtra("lang");
                if (l != null && !l.equals(lang)) {
                    lang = l;
                    Cues.createChannels(this, lang);
                }
                // Re-posting also restores the ongoing notification after an Android 14+ swipe-dismissal (AC 13).
                getSystemService(NotificationManager.class).notify(Cues.ID_TRIP, buildOngoing());
                if (!p.equals(profile)) {
                    profile = p;
                    requestUpdates();
                    Log.i(TAG, "loc:native-profile " + p);
                }
                break;
            }
            case ACTION_ACK: {
                String id = intent.getStringExtra("id");
                if (id != null && BOOK.ack(id)) {
                    getSystemService(NotificationManager.class).cancel(Cues.ID_ALERT);
                    Listener li = listener;
                    if (li != null) li.onAlert(id, kindOf(id), "ack");
                    Log.i(TAG, "alert:native-ack");
                }
                break;
            }
            case ACTION_DISMISS_INFO:
                getSystemService(NotificationManager.class).cancel(Cues.ID_INFO);
                break;
            default:
                break;
        }
        return START_NOT_STICKY;
    }

    private SharedPreferences prefs() {
        return getSharedPreferences(PREFS, MODE_PRIVATE);
    }

    private static String nz(String s, String d) {
        return s == null || s.isEmpty() ? d : s;
    }

    static String kindOf(String id) {
        return id.endsWith(":now") ? "now" : "next";
    }

    @SuppressLint("MissingPermission") // TripPlugin.start checks the location permission
    private void requestUpdates() {
        if (updating) removeUpdates();
        updating = true;
        long iv = profile.intervalMs;
        try {
            if (usePlay) {
                LocationRequest req = new LocationRequest.Builder(profile.priority, iv)
                    .setMinUpdateIntervalMillis(Math.max(1000L, iv / 2))
                    .setWaitForAccurateLocation(false)
                    .build();
                fused.requestLocationUpdates(req, fusedCb, Looper.getMainLooper());
            } else {
                List<String> ps = TripLogic.fallbackProviders(
                    lm.isProviderEnabled(LocationManager.GPS_PROVIDER), lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER), profile.priority);
                for (String p : ps) lm.requestLocationUpdates(p, iv, 0f, lmCb, Looper.getMainLooper());
            }
        } catch (SecurityException e) {
            Log.w(TAG, "trip:no-permission");
            stopSelf();
        }
    }

    private void removeUpdates() {
        if (fused != null) fused.removeLocationUpdates(fusedCb);
        if (lm != null) lm.removeUpdates(lmCb);
        updating = false;
    }

    private void onLocation(Location l) {
        if (l.getTime() <= lastFixT) return; // two LocationManager providers: drop older / duplicate fixes
        lastFixT = l.getTime();
        // Native alerts first: if one fires on this fix, JS hears "alert fired" before the fix and skips its copy.
        float acc = l.hasAccuracy() ? l.getAccuracy() : 999f;
        long now = System.currentTimeMillis();
        for (TripLogic.Alert a : BOOK.onFix(l.getLatitude(), l.getLongitude(), acc, now)) fire(a, false);
        for (TripLogic.Alert a : BOOK.dueRebuzz(now)) fire(a, true);
        Listener li = listener;
        if (li != null) li.onFix(l);
    }

    private void fire(TripLogic.Alert a, boolean rebuzz) {
        getSystemService(NotificationManager.class).notify(Cues.ID_ALERT, Cues.alert(this, a.id, a.title, a.body, a.lang));
        Cues.vibrate(this, "getoff");
        if (a.speak != null && !a.speak.isEmpty()) Speaker.get(this).speak(a.speak, a.lang, true, null);
        Log.i(TAG, (rebuzz ? "alert:native-escalate " : "alert:native-") + a.kind);
        Listener li = listener;
        if (li != null && !rebuzz) li.onAlert(a.id, a.kind, "fired");
    }

    private Notification buildOngoing() {
        return Cues.ongoing(this, title, leg, lang);
    }

    @Override
    public void onDestroy() {
        running = false;
        BOOK.disarm();
        removeUpdates();
        prefs().edit().putBoolean(PREF_ACTIVE, false).apply();
        Log.i(TAG, "trip:service-stop");
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
