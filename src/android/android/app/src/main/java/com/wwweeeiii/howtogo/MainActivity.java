package com.wwweeeiii.howtogo;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.PluginHandle;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Local (in-app) plugins must be registered before super.onCreate.
        registerPlugin(TripPlugin.class);
        super.onCreate(savedInstanceState);
        route(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        route(intent);
    }

    /** Notification Stop → the app opens on the End-trip confirm (OQ7), via the Trip plugin's event. */
    private void route(Intent intent) {
        if (getBridge() == null) return;
        PluginHandle h = getBridge().getPlugin("Trip");
        if (h != null && h.getInstance() instanceof TripPlugin) ((TripPlugin) h.getInstance()).handleIntent(intent);
    }
}
