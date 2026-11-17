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

    static boolean en(String lang) {
        return lang != null && lang.startsWith("en");
    }

    static void createChannels(Context ctx) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = ctx.getSystemService(NotificationManager.class);
        if (nm.getNotificationChannel(CH_ALERT) != null) return; // once
        NotificationChannel trip = new NotificationChannel(CH_TRIP, "行程 · Trip", NotificationManager.IMPORTANCE_LOW);
        trip.setShowBadge(false);
        trip.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(trip);
        NotificationChannel alert = new NotificationChannel(CH_ALERT, "下车提醒 · Get-off alerts", NotificationManager.IMPORTANCE_HIGH);
        alert.enableVibration(true);
        alert.setVibrationPattern(TripLogic.waveform("getoff"));
        alert.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(alert);
        NotificationChannel info = new NotificationChannel(CH_INFO, "提示 · Updates", NotificationManager.IMPORTANCE_DEFAULT);
        info.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(info);
    }

    static PendingIntent openApp(Context ctx, String action, int req) {
        Intent i = new Intent(ctx, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_NEW_TASK);
        if (action != null) i.setAction(action);
        return PendingIntent.getActivity(ctx, req, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    /** Lock-screen get-off alert with a "知道了 / OK" action that acknowledges it without unlocking. */
    static Notification alert(Context ctx, String id, String title, String body, String lang) {
        Intent ack = new Intent(ctx, TripService.class).setAction(TripService.ACTION_ACK).putExtra("id", id);
        PendingIntent ackPi = PendingIntent.getService(ctx, 7, ack, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        return new NotificationCompat.Builder(ctx, CH_ALERT)
            .setSmallIcon(R.drawable.ic_stat_trip)
            .setContentTitle(title)
            .setContentText(body)
            .setPriority(NotificationCompat.PRIORITY_MAX) // pre-26
            .setVibrate(TripLogic.waveform("getoff")) // pre-26
            .setDefaults(NotificationCompat.DEFAULT_SOUND)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setAutoCancel(true)
            .setContentIntent(openApp(ctx, ACTION_OPEN_ALERT, 3))
            .addAction(0, en(lang) ? "OK" : "知道了", ackPi)
            .build();
    }

    static Notification info(Context ctx, String title, String body) {
        return new NotificationCompat.Builder(ctx, CH_INFO)
            .setSmallIcon(R.drawable.ic_stat_trip)
            .setContentTitle(title)
            .setContentText(body)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setAutoCancel(true)
            .setContentIntent(openApp(ctx, null, 4))
            .build();
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
