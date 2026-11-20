package com.wwweeeiii.howtogo;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.PluginHandle;
import androidx.core.content.ContextCompat;
import androidx.core.splashscreen.SplashScreen;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Local (in-app) plugins must be registered before super.onCreate.
        registerPlugin(TripPlugin.class);
        // STYLE-GUIDE 6h.1: SplashScreen API (backported to API 24), then AppTheme.NoActionBar.
        SplashScreen.installSplashScreen(this);
        super.onCreate(savedInstanceState);
        // c-canvas of the current theme behind the WebView: no white flash between splash and H1 in dark mode.
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().setBackgroundColor(ContextCompat.getColor(this, R.color.splash_background));
        }
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
