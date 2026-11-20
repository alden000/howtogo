package com.wwweeeiii.howtogo;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

/** Notification channels (M6 §E), lock-screen alerts and native vibration (6c.13 names). */
final class Cues {
    private Cues() {}

    static final String CH_TRIP = "trip"; // ongoing, low
    static final String CH_ALERT = "alerts"; // get-off: high, public, getoff vibration
    static final String CH_INFO = "info"; // arrival, share ended, other cues
    static final int ID_TRIP = 1001;
    static final int ID_ALERT = 1002;
    static final int ID_INFO = 1003;

    static final String ACTION_OPEN_STOP = "com.wwweeeiii.howtogo.OPEN_STOP";
    static final String ACTION_OPEN_ALERT = "com.wwweeeiii.howtogo.OPEN_ALERT";

    private static final String PREFS = "cues";
    private static final String PREF_LANG = "channelLang";

    /**
     * Channels per 6h.7. Names/descriptions follow the app language: re-creating a channel with the same id updates
     * its text (importance and sound stay as the user left them). Cheap no-op when the language is unchanged.
     */
    static void createChannels(Context ctx, String lang) {
        if (Build.VERSION.SDK_INT < 26) return;
        String l = TripLogic.en(lang) ? "en" : "zh";
        NotificationManager nm = ctx.getSystemService(NotificationManager.class);
        android.content.SharedPreferences sp = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        if (l.equals(sp.getString(PREF_LANG, null)) && nm.getNotificationChannel(CH_ALERT) != null) return;
        NotificationChannel trip = new NotificationChannel(CH_TRIP, TripLogic.channelName(CH_TRIP, l), NotificationManager.IMPORTANCE_LOW);
        trip.setDescription(TripLogic.channelDescription(CH_TRIP, l));
        trip.setShowBadge(false);
        trip.setSound(null, null);
        trip.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(trip);
        NotificationChannel alert = new NotificationChannel(CH_ALERT, TripLogic.channelName(CH_ALERT, l), NotificationManager.IMPORTANCE_HIGH);
        alert.setDescription(TripLogic.channelDescription(CH_ALERT, l));
        alert.enableVibration(true);
        alert.setVibrationPattern(TripLogic.waveform("getoff"));
        alert.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(alert);
        NotificationChannel info = new NotificationChannel(CH_INFO, TripLogic.channelName(CH_INFO, l), NotificationManager.IMPORTANCE_DEFAULT);
        info.setDescription(TripLogic.channelDescription(CH_INFO, l));
        info.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(info);
        sp.edit().putString(PREF_LANG, l).apply();
    }

    /** The language the channels were last created in ("zh" default before any trip). */
    static String channelLang(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(PREF_LANG, "zh");
    }

    static PendingIntent openApp(Context ctx, String action, int req) {
        Intent i = new Intent(ctx, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_NEW_TASK);
        if (action != null) i.setAction(action);
        return PendingIntent.getActivity(ctx, req, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private static NotificationCompat.Builder base(Context ctx, String channel, String title, String body) {
        return new NotificationCompat.Builder(ctx, channel)
            .setSmallIcon(R.drawable.ic_stat_trip)
            .setColor(ContextCompat.getColor(ctx, R.color.notification_accent))
            .setContentTitle(title)
            .setContentText(body)
            // 6h.7: the expanded view always shows the full text.
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC);
    }

    /** Ongoing trip (6h.7): subtext 行程进行中, title = step short text, End trip → the End-trip sheet (OQ7). */
    static Notification ongoing(Context ctx, String title, String leg, String lang) {
        String t = title == null || title.isEmpty() ? TripLogic.ongoingTitle(lang) : title;
        return base(ctx, CH_TRIP, t, TripLogic.ongoingText(leg, lang))
            .setSubText(TripLogic.ongoingTitle(lang))
            .setShowWhen(false)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setCategory(NotificationCompat.CATEGORY_NAVIGATION)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .setContentIntent(openApp(ctx, null, 1))
            .addAction(0, TripLogic.endTripLabel(lang), openApp(ctx, ACTION_OPEN_STOP, 2))
            .build();
    }

    /** Lock-screen get-off alert (next / now share one id, so "now" replaces "next"); 知道了 acks without unlocking. */
    static Notification alert(Context ctx, String id, String title, String body, String lang) {
        Intent ack = new Intent(ctx, TripService.class).setAction(TripService.ACTION_ACK).putExtra("id", id);
        PendingIntent ackPi = PendingIntent.getService(ctx, 7, ack, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        return base(ctx, CH_ALERT, title, body)
            .setPriority(NotificationCompat.PRIORITY_MAX) // pre-26
            .setVibrate(TripLogic.waveform("getoff")) // pre-26
            .setDefaults(NotificationCompat.DEFAULT_SOUND)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setAutoCancel(true)
            .setContentIntent(openApp(ctx, ACTION_OPEN_ALERT, 3))
            .addAction(0, TripLogic.okLabel(lang), ackPi)
            .build();
    }

    /**
     * Info channel (6h.7): off-route (知道了 + gentle haptic), arrival (auto-cancel, 10 min timeout), share ended.
     * Title/body come from the web layer and never carry destination or contact names.
     */
    static Notification info(Context ctx, String kind, String title, String body, String lang) {
        NotificationCompat.Builder b = base(ctx, CH_INFO, title, body).setAutoCancel(true).setContentIntent(openApp(ctx, null, 4));
        if ("offroute".equals(kind)) {
            Intent dismiss = new Intent(ctx, TripService.class).setAction(TripService.ACTION_DISMISS_INFO);
            b.addAction(0, TripLogic.okLabel(lang), PendingIntent.getService(ctx, 8, dismiss, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
        } else if ("arrival".equals(kind)) {
            b.setTimeoutAfter(TripLogic.ARRIVAL_TIMEOUT_MS);
        }
        return b.build();
    }

    @SuppressWarnings("deprecation")
    static void vibrate(Context ctx, String name) {
        long[] w = TripLogic.waveform(name);
        if (w == null) return;
        Vibrator v;
        if (Build.VERSION.SDK_INT >= 31) {
            VibratorManager vm = ctx.getSystemService(VibratorManager.class);
            v = vm == null ? null : vm.getDefaultVibrator();
        } else {
            v = (Vibrator) ctx.getSystemService(Context.VIBRATOR_SERVICE);
        }
        if (v == null || !v.hasVibrator()) return;
        // Alarm usage so the get-off buzz is not dropped with the screen off.
        AudioAttributes aa = new AudioAttributes.Builder()
            .setUsage("getoff".equals(name) ? AudioAttributes.USAGE_ALARM : AudioAttributes.USAGE_ASSISTANCE_SONIFICATION)
            .build();
        if (Build.VERSION.SDK_INT >= 26) v.vibrate(VibrationEffect.createWaveform(w, -1), aa);
        else v.vibrate(w, -1, aa);
    }
}
