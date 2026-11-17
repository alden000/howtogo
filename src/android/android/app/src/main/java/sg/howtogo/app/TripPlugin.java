package sg.howtogo.app;

import android.Manifest;
import android.content.Intent;
import android.location.Location;
import android.os.Build;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * M6 spike: "Trip" plugin. JS starts a location foreground service while the app is
 * visible (FGS-while-in-use: no ACCESS_BACKGROUND_LOCATION), receives "fix" events
 * with the screen off, can change the GPS interval per leg, and can arm a native
 * proximity alert (notification + vibration + TTS) that fires even if the WebView's
 * JS is throttled.
 */
@CapacitorPlugin(
    name = "Trip",
    permissions = {
        @Permission(alias = "location", strings = { Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION }),
        @Permission(alias = "notifications", strings = { "android.permission.POST_NOTIFICATIONS" })
    }
)
public class TripPlugin extends Plugin implements TripService.Listener {

    @Override
    public void load() {
        TripService.listener = this;
    }

    @PluginMethod
    public void requestTripPermissions(PluginCall call) {
        String[] aliases = Build.VERSION.SDK_INT >= 33 ? new String[] { "location", "notifications" } : new String[] { "location" };
        requestPermissionForAliases(aliases, call, "permsDone");
    }

    @PermissionCallback
    private void permsDone(PluginCall call) {
        call.resolve(permStates());
    }

    @PluginMethod
    public void checkTripPermissions(PluginCall call) {
        call.resolve(permStates());
    }

    private JSObject permStates() {
        JSObject r = new JSObject();
        r.put("location", getPermissionState("location").toString());
        r.put("notifications", Build.VERSION.SDK_INT >= 33 ? getPermissionState("notifications").toString() : "granted");
        return r;
    }

    /** Must be called while the activity is visible (Android 12+ FGS start restriction). */
    @PluginMethod
    public void start(PluginCall call) {
        if (getPermissionState("location") != PermissionState.GRANTED) {
            call.reject("location permission not granted", "denied");
            return;
        }
        Intent i = new Intent(getContext(), TripService.class).setAction(TripService.ACTION_START);
        i.putExtra("intervalMs", call.getLong("intervalMs", 5000L));
        i.putExtra("title", call.getString("title", "行程进行中 / Trip in progress"));
        i.putExtra("body", call.getString("body", ""));
        i.putExtra("stopLabel", call.getString("stopLabel", "结束 / Stop"));
        try {
            ContextCompat.startForegroundService(getContext(), i);
            call.resolve();
        } catch (Exception e) {
            // ForegroundServiceStartNotAllowedException (31+) or SecurityException (34+ without FGS perm)
            call.reject("could not start trip service: " + e.getMessage(), "unavailable");
        }
    }

    @PluginMethod
    public void setInterval(PluginCall call) {
        Intent i = new Intent(getContext(), TripService.class).setAction(TripService.ACTION_INTERVAL);
        i.putExtra("intervalMs", call.getLong("intervalMs", 5000L));
        sendIfRunning(i);
        call.resolve();
    }

    @PluginMethod
    public void updateNotification(PluginCall call) {
        Intent i = new Intent(getContext(), TripService.class).setAction(TripService.ACTION_UPDATE);
        i.putExtra("title", call.getString("title"));
        i.putExtra("body", call.getString("body"));
        sendIfRunning(i);
        call.resolve();
    }

    @PluginMethod
    public void armAlert(PluginCall call) {
        Intent i = new Intent(getContext(), TripService.class).setAction(TripService.ACTION_ARM);
        i.putExtra("lat", call.getDouble("lat", 0.0));
        i.putExtra("lng", call.getDouble("lng", 0.0));
        i.putExtra("radiusM", call.getFloat("radiusM", 300f));
        i.putExtra("title", call.getString("title", "下一站下车"));
        i.putExtra("body", call.getString("body", ""));
        i.putExtra("speak", call.getString("speak", ""));
        i.putExtra("lang", call.getString("lang", "zh-CN"));
        sendIfRunning(i);
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        getContext().stopService(new Intent(getContext(), TripService.class));
        call.resolve();
    }

    private void sendIfRunning(Intent i) {
        if (TripService.running) getContext().startService(i);
    }

    // --- TripService.Listener (called on the main thread) ---
    @Override
    public void onFix(Location l) {
        JSObject f = new JSObject();
        f.put("lat", l.getLatitude());
        f.put("lng", l.getLongitude());
        f.put("acc", l.hasAccuracy() ? l.getAccuracy() : -1);
        if (l.hasBearing()) f.put("heading", l.getBearing());
        if (l.hasSpeed()) f.put("speed", l.getSpeed());
        f.put("t", l.getTime());
        notifyListeners("fix", f);
    }

    @Override
    public void onAlertFired() {
        notifyListeners("alertFired", new JSObject());
    }

    @Override
    public void onStopped(String reason) {
        JSObject o = new JSObject();
        o.put("reason", reason);
        // retain=true: delivered later if JS has no listener yet (e.g. WebView reloaded).
        notifyListeners("stopped", o, true);
    }
}
