package com.wwweeeiii.howtogo;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Pure decision logic of the trip service (no Android types, JVM-tested):
 * per-leg interval and priority (M6 AC 12), haptic patterns (STYLE-GUIDE 6c.13),
 * location-provider choice (AC 14), and the native backup alert book with
 * dedupe against the JS side (AC 17–19, 22).
 */
public final class TripLogic {
    private TripLogic() {}

    // Same values as com.google.android.gms.location.Priority (kept here so this class has no Android deps).
    public static final int PRIORITY_HIGH_ACCURACY = 100;
    public static final int PRIORITY_BALANCED = 102;

    /** Rides switch to the fast profile this many stops before alighting. */
    public static final int NEAR_ALIGHT_STOPS = 3;
    /** Alert re-buzz delay when not acknowledged (M2 escalation parity). */
    public static final long REBUZZ_AFTER_MS = 20_000L;
    /** Fixes worse than this never fire a native alert. */
    public static final float MAX_ALERT_ACC_M = 100f;

    public static final class Profile {
        public final long intervalMs;
        public final int priority;

        public Profile(long intervalMs, int priority) {
            this.intervalMs = intervalMs;
            this.priority = priority;
        }

        @Override
        public boolean equals(Object o) {
            return o instanceof Profile && ((Profile) o).intervalMs == intervalMs && ((Profile) o).priority == priority;
        }

        @Override
        public int hashCode() {
            return (int) intervalMs * 31 + priority;
        }

        @Override
        public String toString() {
            return intervalMs + "ms/" + (priority == PRIORITY_HIGH_ACCURACY ? "high" : "balanced");
        }
    }

    /**
     * AC 12: walk 2 s HIGH; wait 5 s BALANCED; ride 10 s BALANCED until 3 stops before alighting, then
     * 2 s HIGH; last walk 2 s HIGH. Low-battery mode widens only the mid-ride interval to 15 s.
     * Unknown legs get the safe walk profile.
     */
    public static Profile profileFor(String leg, Integer stopsLeft, boolean lowBattery) {
        if ("wait".equals(leg)) return new Profile(5_000L, PRIORITY_BALANCED);
        if ("ride".equals(leg)) {
            if (stopsLeft != null && stopsLeft <= NEAR_ALIGHT_STOPS) return new Profile(2_000L, PRIORITY_HIGH_ACCURACY);
            return new Profile(lowBattery ? 15_000L : 10_000L, PRIORITY_BALANCED);
        }
        return new Profile(2_000L, PRIORITY_HIGH_ACCURACY); // walk, last_walk, unknown
    }

    /** LocationManager fallback (no Play services, AC 14): which providers to request, best first. */
    public static List<String> fallbackProviders(boolean gpsEnabled, boolean networkEnabled, int priority) {
        List<String> out = new ArrayList<>();
        if (gpsEnabled && (priority == PRIORITY_HIGH_ACCURACY || !networkEnabled)) out.add("gps");
        if (networkEnabled) out.add("network");
        if (gpsEnabled && !out.contains("gps")) out.add("gps"); // balanced: network first, gps as backup
        return out;
    }

    // ---------------------------------------------------------------- haptics (6c.13)
    private static final Map<String, long[]> HAPTICS = new HashMap<>();

    static {
        HAPTICS.put("tick", new long[] { 12 });
        HAPTICS.put("confirm", new long[] { 20, 40, 20 });
        HAPTICS.put("attention", new long[] { 60, 80, 60 });
        HAPTICS.put("getoff", new long[] { 300, 150, 300, 150, 600 });
        HAPTICS.put("arrive", new long[] { 40, 60, 40, 60, 160 });
        HAPTICS.put("gentle", new long[] { 30, 60, 30 });
    }

    /** Canonical on/off pattern (ms), or null for an unknown name. */
    public static long[] haptic(String name) {
        long[] p = HAPTICS.get(name);
        return p == null ? null : p.clone();
    }

    /** Android waveform = leading delay 0 + the on/off pattern. */
    public static long[] waveform(String name) {
        long[] p = HAPTICS.get(name);
        if (p == null) return null;
        long[] w = new long[p.length + 1];
        System.arraycopy(p, 0, w, 1, p.length);
        return w;
    }

    // ---------------------------------------------------------------- text
    /** Ongoing notification body: one line, no coordinates (digits-with-dot pairs are dropped), max 80 chars. */
    public static String clip(String s, int max) {
        if (s == null) return "";
        String t = s.replaceAll("-?\\d{1,3}\\.\\d{3,}\\s*,?\\s*", "").replaceAll("\\s+", " ").trim();
        return t.length() <= max ? t : t.substring(0, max - 1) + "…";
    }

    public static String ongoingTitle(String lang) {
        return lang != null && lang.startsWith("en") ? "Trip in progress" : "行程进行中";
    }

    // ---------------------------------------------------------------- distance
    public static double distanceM(double lat1, double lng1, double lat2, double lng2) {
        double r = 6_371_000d;
        double dLat = Math.toRadians(lat2 - lat1), dLng = Math.toRadians(lng2 - lng1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
            + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
        return 2 * r * Math.asin(Math.min(1, Math.sqrt(a)));
    }

    // ---------------------------------------------------------------- alert book
    public static final class Alert {
        public final String id; // trip:leg:kind
        public final String kind; // next | now
        public final double lat, lng;
        public final float radiusM;
        public final String title, body, speak, lang;
        long firedAt = -1;
        boolean acked = false;
        boolean rebuzzed = false;
        boolean byNative = false;

        public Alert(String id, String kind, double lat, double lng, float radiusM, String title, String body, String speak, String lang) {
            this.id = id;
            this.kind = kind;
            this.lat = lat;
            this.lng = lng;
            this.radiusM = radiusM;
            this.title = title;
            this.body = body;
            this.speak = speak;
            this.lang = lang;
        }

        public boolean firedByNative() {
            return byNative;
        }
    }

    /**
     * Armed alerts + the fired set shared by both sides. Whichever side fires an id first marks it; the
     * other side skips it. Thread-safe (the plugin thread marks, the service's main thread checks).
     */
    public static final class AlertBook {
        private final Map<String, Alert> armed = new LinkedHashMap<>();
        private final Set<String> fired = new HashSet<>();

        /** Replaces the armed set (start of a ride leg, re-route). Fired ids stay fired. */
        public synchronized void arm(List<Alert> alerts) {
            armed.clear();
            for (Alert a : alerts) if (!fired.contains(a.id)) armed.put(a.id, a);
        }

        /** End, off-route on a ride leg, arrival: nothing armed, nothing re-buzzes. */
        public synchronized void disarm() {
            armed.clear();
        }

        /** New trip: forget everything. */
        public synchronized void reset() {
            armed.clear();
            fired.clear();
        }

        /** JS fired first. True when this call marked it (the native side will skip it). */
        public synchronized boolean markFired(String id) {
            Alert a = armed.remove(id);
            return fired.add(id) || a != null;
        }

        public synchronized boolean isFired(String id) {
            return fired.contains(id);
        }

        public synchronized boolean isArmed(String id) {
            return armed.containsKey(id);
        }

        /**
         * On each fix: alerts to fire now (at most one; "now" wins over "next" on the same fix, and a
         * pending "next" is dropped once "now" fires — never "next stop" after "now").
         */
        public synchronized List<Alert> onFix(double lat, double lng, float acc, long nowMs) {
            List<Alert> out = new ArrayList<>();
            if (acc > MAX_ALERT_ACC_M) return out;
            Alert hit = null;
            for (Alert a : armed.values()) {
                if (a.firedAt >= 0 || fired.contains(a.id)) continue;
                if (distanceM(lat, lng, a.lat, a.lng) > a.radiusM) continue;
                if (hit == null || "now".equals(a.kind)) hit = a;
            }
            if (hit == null) return out;
            hit.firedAt = nowMs;
            hit.byNative = true;
            fired.add(hit.id);
            if ("now".equals(hit.kind)) {
                String prefix = hit.id.substring(0, hit.id.lastIndexOf(':') + 1);
                fired.add(prefix + "next");
                armed.remove(prefix + "next");
            }
            out.add(hit);
            return out;
        }

        /** Fix-driven escalation: a natively fired, unacknowledged alert re-buzzes once after 20 s. */
        public synchronized List<Alert> dueRebuzz(long nowMs) {
            List<Alert> out = new ArrayList<>();
            for (Alert a : armed.values()) {
                if (a.firedAt < 0 || a.acked || a.rebuzzed) continue;
                if (nowMs - a.firedAt >= REBUZZ_AFTER_MS) {
                    a.rebuzzed = true;
                    out.add(a);
                }
            }
            return out;
        }

        /** "知道了 / OK" (lock screen or in-app). True when the id was known. */
        public synchronized boolean ack(String id) {
            Alert a = armed.get(id);
            if (a != null) a.acked = true;
            return a != null || fired.contains(id);
        }

        public synchronized int armedCount() {
            return armed.size();
        }
    }
}
