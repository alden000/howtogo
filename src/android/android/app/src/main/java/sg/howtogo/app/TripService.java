package sg.howtogo.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.media.AudioAttributes;
import android.os.Build;
import android.os.IBinder;
import android.os.Looper;
import android.speech.tts.TextToSpeech;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;
import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;
import java.util.Locale;

/** Foreground service of type "location": runs only while a trip is active. */
public class TripService extends Service {
    interface Listener {
        void onFix(Location l);
        void onAlertFired();
        void onStopped(String reason);
    }

    static final String ACTION_START = "sg.howtogo.app.trip.START";
    static final String ACTION_STOP = "sg.howtogo.app.trip.STOP";
    static final String ACTION_INTERVAL = "sg.howtogo.app.trip.INTERVAL";
    static final String ACTION_UPDATE = "sg.howtogo.app.trip.UPDATE";
    static final String ACTION_ARM = "sg.howtogo.app.trip.ARM";

    static final String CH_TRIP = "trip";      // ongoing, low importance (no sound)
    static final String CH_ALERT = "alerts";   // get-off alerts: high importance, lock screen, vibration
    static final int ID_TRIP = 1001;
    static final int ID_ALERT = 1002;
    static final long[] VIBRATE_GET_OFF = { 0, 400, 150, 400, 150, 400 }; // == VIBRATE_PATTERNS.get_off

    static volatile boolean running = false;
    static volatile Listener listener;

    private FusedLocationProviderClient fused;
    private TextToSpeech tts;
    private boolean ttsReady = false;
    private String title = "", body = "", stopLabel = "Stop";
    private long intervalMs = 5000;
    // native proximity alert
    private boolean armed = false;
    private double aLat, aLng;
    private float aRadius;
    private String aTitle, aBody, aSpeak, aLang;

    private final LocationCallback cb = new LocationCallback() {
        @Override
        public void onLocationResult(LocationResult r) {
            Location l = r.getLastLocation();
            if (l == null) return;
            Listener li = listener;
            if (li != null) li.onFix(l);
            checkAlert(l);
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        fused = LocationServices.getFusedLocationProviderClient(this);
        createChannels();
        tts = new TextToSpeech(this, status -> ttsReady = status == TextToSpeech.SUCCESS);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : null;
        if (action == null) { // restarted by the system after process death: don't resurrect a trip silently
            stopSelf();
            return START_NOT_STICKY;
        }
        switch (action) {
            case ACTION_START:
                title = intent.getStringExtra("title");
                body = intent.getStringExtra("body");
                stopLabel = intent.getStringExtra("stopLabel");
                intervalMs = intent.getLongExtra("intervalMs", 5000L);
                // Must call startForeground within 5 s, with the type declared in the manifest.
                ServiceCompat.startForeground(this, ID_TRIP, buildOngoing(),
                    Build.VERSION.SDK_INT >= 29 ? ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION : 0);
                running = true;
                requestUpdates();
                break;
            case ACTION_INTERVAL:
                intervalMs = intent.getLongExtra("intervalMs", intervalMs);
                requestUpdates();
                break;
            case ACTION_UPDATE:
                if (intent.getStringExtra("title") != null) title = intent.getStringExtra("title");
                if (intent.getStringExtra("body") != null) body = intent.getStringExtra("body");
                getSystemService(NotificationManager.class).notify(ID_TRIP, buildOngoing());
                break;
            case ACTION_ARM:
                aLat = intent.getDoubleExtra("lat", 0);
                aLng = intent.getDoubleExtra("lng", 0);
                aRadius = intent.getFloatExtra("radiusM", 300f);
                aTitle = intent.getStringExtra("title");
                aBody = intent.getStringExtra("body");
                aSpeak = intent.getStringExtra("speak");
                aLang = intent.getStringExtra("lang");
                armed = true;
                break;
            case ACTION_STOP: // from the notification's Stop button
                Listener li = listener;
                if (li != null) li.onStopped("user");
                stopSelf();
                break;
        }
        return START_NOT_STICKY;
    }

    @SuppressWarnings("MissingPermission") // checked by TripPlugin.start
    private void requestUpdates() {
        fused.removeLocationUpdates(cb);
        LocationRequest req = new LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, intervalMs)
            .setMinUpdateIntervalMillis(Math.max(1000L, intervalMs / 2))
            .setWaitForAccurateLocation(false)
            .build();
        try {
            fused.requestLocationUpdates(req, cb, Looper.getMainLooper());
        } catch (SecurityException e) {
            stopSelf();
        }
    }

    private void checkAlert(Location l) {
        if (!armed) return;
        float[] d = new float[1];
        Location.distanceBetween(l.getLatitude(), l.getLongitude(), aLat, aLng, d);
        if (d[0] > aRadius) return;
        armed = false;
        getSystemService(NotificationManager.class).notify(ID_ALERT, buildAlert(aTitle, aBody));
        if (ttsReady && aSpeak != null && !aSpeak.isEmpty()) {
            tts.setLanguage(Locale.forLanguageTag(aLang));
            tts.setAudioAttributes(new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE)
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build());
            tts.speak(aSpeak, TextToSpeech.QUEUE_FLUSH, null, "alert");
        }
        Listener li = listener;
        if (li != null) li.onAlertFired();
    }

    private void createChannels() {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = getSystemService(NotificationManager.class);
        NotificationChannel trip = new NotificationChannel(CH_TRIP, "行程 / Trip", NotificationManager.IMPORTANCE_LOW);
        trip.setShowBadge(false);
        trip.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(trip);
        NotificationChannel alert = new NotificationChannel(CH_ALERT, "下车提醒 / Get-off alerts", NotificationManager.IMPORTANCE_HIGH);
        alert.enableVibration(true);
        alert.setVibrationPattern(VIBRATE_GET_OFF);
        alert.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        alert.setBypassDnd(false); // only honoured if the user allows it
        nm.createNotificationChannel(alert);
    }

    private PendingIntent openApp() {
        Intent i = new Intent(this, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(this, 0, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private Notification buildOngoing() {
        PendingIntent stop = PendingIntent.getService(this, 1,
            new Intent(this, TripService.class).setAction(ACTION_STOP),
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        return new NotificationCompat.Builder(this, CH_TRIP)
            .setSmallIcon(R.drawable.ic_stat_trip)
            .setContentTitle(title)
            .setContentText(body)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setCategory(NotificationCompat.CATEGORY_NAVIGATION)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .setContentIntent(openApp())
            .addAction(0, stopLabel, stop)
            .build();
    }

    private Notification buildAlert(String t, String b) {
        return new NotificationCompat.Builder(this, CH_ALERT)
            .setSmallIcon(R.drawable.ic_stat_trip)
            .setContentTitle(t)
            .setContentText(b)
            .setPriority(NotificationCompat.PRIORITY_MAX)   // pre-26
            .setVibrate(VIBRATE_GET_OFF)                     // pre-26
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setAutoCancel(true)
            .setContentIntent(openApp())
            .build();
    }

    @Override
    public void onDestroy() {
        running = false;
        armed = false;
        fused.removeLocationUpdates(cb);
        if (tts != null) tts.shutdown();
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) { return null; }
}
