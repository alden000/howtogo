package com.wwweeeiii.howtogo;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.util.Arrays;
import java.util.List;
import org.junit.Before;
import org.junit.Test;

public class TripLogicTest {
    static final int HIGH = TripLogic.PRIORITY_HIGH_ACCURACY, BAL = TripLogic.PRIORITY_BALANCED;

    private static void profile(String leg, Integer stops, boolean low, long ms, int prio) {
        TripLogic.Profile p = TripLogic.profileFor(leg, stops, low);
        assertEquals(leg + "/" + stops + "/" + low + " interval", ms, p.intervalMs);
        assertEquals(leg + "/" + stops + "/" + low + " priority", prio, p.priority);
    }

    // ---- AC 12: per-leg interval and priority table
    @Test
    public void intervalTable() {
        profile("walk", null, false, 2000, HIGH);
        profile("wait", null, false, 5000, BAL);
        profile("ride", null, false, 10000, BAL);
        profile("ride", 8, false, 10000, BAL);
        profile("ride", 4, false, 10000, BAL);
        profile("ride", 3, false, 2000, HIGH);
        profile("ride", 1, false, 2000, HIGH);
        profile("ride", 0, false, 2000, HIGH);
        profile("last_walk", null, false, 2000, HIGH);
        profile(null, null, false, 2000, HIGH);
    }

    @Test
    public void lowBatteryWidensOnlyMidRide() {
        profile("ride", 9, true, 15000, BAL);
        profile("ride", 3, true, 2000, HIGH); // never delays the get-off approach (M5 AC 9)
        profile("walk", null, true, 2000, HIGH);
        profile("wait", null, true, 5000, BAL);
        profile("last_walk", null, true, 2000, HIGH);
    }

    // ---- AC 14: LocationManager fallback providers (fake provider states)
    @Test
    public void fallbackProviders() {
        assertEquals(Arrays.asList("gps", "network"), TripLogic.fallbackProviders(true, true, HIGH));
        assertEquals(Arrays.asList("network", "gps"), TripLogic.fallbackProviders(true, true, BAL));
        assertEquals(Arrays.asList("gps"), TripLogic.fallbackProviders(true, false, BAL));
        assertEquals(Arrays.asList("network"), TripLogic.fallbackProviders(false, true, HIGH));
        assertTrue(TripLogic.fallbackProviders(false, false, HIGH).isEmpty());
    }

    // ---- AC 9: canonical 6c.13 haptic names
    @Test
    public void hapticsMatchStyleGuide() {
        assertArrayEquals(new long[] { 300, 150, 300, 150, 600 }, TripLogic.haptic("getoff"));
        assertArrayEquals(new long[] { 0, 300, 150, 300, 150, 600 }, TripLogic.waveform("getoff"));
        assertArrayEquals(new long[] { 12 }, TripLogic.haptic("tick"));
        assertArrayEquals(new long[] { 20, 40, 20 }, TripLogic.haptic("confirm"));
        assertArrayEquals(new long[] { 60, 80, 60 }, TripLogic.haptic("attention"));
        assertArrayEquals(new long[] { 40, 60, 40, 60, 160 }, TripLogic.haptic("arrive"));
        assertArrayEquals(new long[] { 30, 60, 30 }, TripLogic.haptic("gentle"));
        assertNull(TripLogic.haptic("get_off")); // old spike name is gone
    }

    @Test
    public void notificationTextHasNoCoordinates() {
        assertEquals("在 at 下车", TripLogic.clip("在 1.352083, 103.819836 at 下车", 80));
        assertEquals(10, TripLogic.clip("abcdefghijklmnop", 10).length());
        assertEquals("", TripLogic.clip(null, 10));
        assertEquals("行程进行中", TripLogic.ongoingTitle("zh-CN"));
        assertEquals("Trip in progress", TripLogic.ongoingTitle("en-SG"));
    }

    // ---- AC 17–19, 22: native backup alert book
    // A ride along a line of latitude; ~111 m per 0.001°.
    static final double LAT = 1.3400, PREV_LNG = 103.8500, ALIGHT_LNG = 103.8600;
    TripLogic.AlertBook book;

    static TripLogic.Alert alert(String kind, double lng, float r) {
        return new TripLogic.Alert("t1:s3:" + kind, kind, LAT, lng, r, "下一站下车", "Toa Payoh Int", "下一站下车", "zh-CN");
    }

    @Before
    public void setUp() {
        book = new TripLogic.AlertBook();
        book.arm(Arrays.asList(alert("next", PREV_LNG, 80), alert("now", ALIGHT_LNG, 150)));
    }

    @Test
    public void firesOnceOnFirstQualifyingFix_noJs() {
        assertTrue(book.onFix(LAT, PREV_LNG - 0.005, 10, 0).isEmpty()); // far
        List<TripLogic.Alert> f = book.onFix(LAT, PREV_LNG + 0.0003, 10, 1000); // ~33 m
        assertEquals(1, f.size());
        assertEquals("next", f.get(0).kind);
        assertTrue(f.get(0).firedByNative());
        assertTrue(book.onFix(LAT, PREV_LNG + 0.0004, 10, 2000).isEmpty()); // once
        List<TripLogic.Alert> n = book.onFix(LAT, ALIGHT_LNG - 0.0005, 10, 3000);
        assertEquals("now", n.get(0).kind);
        assertTrue(book.onFix(LAT, ALIGHT_LNG, 10, 4000).isEmpty());
    }

    @Test
    public void jsFiredFirstNativeSkips() {
        assertTrue(book.markFired("t1:s3:next"));
        assertTrue(book.isFired("t1:s3:next"));
        assertTrue(book.onFix(LAT, PREV_LNG, 5, 0).isEmpty());
        assertFalse(book.isArmed("t1:s3:next"));
    }

    @Test
    public void nativeFiredFirstJsSeesIt() {
        book.onFix(LAT, PREV_LNG, 5, 0);
        assertTrue(book.isFired("t1:s3:next")); // JS marks later: no second alert either way
        book.markFired("t1:s3:next");
        assertTrue(book.onFix(LAT, PREV_LNG, 5, 1000).isEmpty());
    }

    @Test
    public void nowWinsAndSuppressesNext() {
        book.arm(Arrays.asList(alert("next", ALIGHT_LNG, 500), alert("now", ALIGHT_LNG, 150)));
        List<TripLogic.Alert> f = book.onFix(LAT, ALIGHT_LNG, 5, 0);
        assertEquals(1, f.size());
        assertEquals("now", f.get(0).kind);
        assertTrue(book.isFired("t1:s3:next")); // never "next stop" after "now"
    }

    @Test
    public void inaccurateFixNeverFires() {
        assertTrue(book.onFix(LAT, PREV_LNG, 150, 0).isEmpty());
    }

    @Test
    public void rebuzzOnceAfter20sUnlessAcked() {
        book.onFix(LAT, PREV_LNG, 5, 0);
        assertTrue(book.dueRebuzz(19_999).isEmpty());
        assertEquals(1, book.dueRebuzz(20_000).size());
        assertTrue(book.dueRebuzz(60_000).isEmpty()); // then stops

        book.arm(Arrays.asList(alert("now", ALIGHT_LNG, 150)));
        book.onFix(LAT, ALIGHT_LNG, 5, 100_000);
        assertTrue(book.ack("t1:s3:now"));
        assertTrue(book.dueRebuzz(130_000).isEmpty());
    }

    @Test
    public void disarmAndRearm() {
        book.disarm(); // off-route / end / arrival
        assertEquals(0, book.armedCount());
        assertTrue(book.onFix(LAT, PREV_LNG, 5, 0).isEmpty());
        book.arm(Arrays.asList(alert("next", PREV_LNG, 80))); // re-route: re-armed for the new legs
        assertEquals(1, book.onFix(LAT, PREV_LNG, 5, 0).size());
        book.arm(Arrays.asList(alert("next", PREV_LNG, 80))); // already fired ids stay fired
        assertEquals(0, book.armedCount());
        book.reset();
        book.arm(Arrays.asList(alert("next", PREV_LNG, 80)));
        assertEquals(1, book.armedCount());
    }

    @Test
    public void distance() {
        assertEquals(111.3, TripLogic.distanceM(1.34, 103.85, 1.34, 103.851), 1.0);
    }

    @Test
    public void channelCopyFollowsAppLanguage() {
        // STYLE-GUIDE 6h.7 channel table
        assertEquals("行程进行中", TripLogic.channelName("trip", "zh-CN"));
        assertEquals("Trip in progress", TripLogic.channelName("trip", "en-SG"));
        assertEquals("下车提醒", TripLogic.channelName("alerts", "zh"));
        assertEquals("Get-off alerts", TripLogic.channelName("alerts", "en"));
        assertEquals("到达和分享", TripLogic.channelName("info", "zh-CN"));
        assertEquals("Arrival and sharing", TripLogic.channelName("info", "en-SG"));
        assertEquals("坐车、走路时一直显示现在这一步。", TripLogic.channelDescription("trip", "zh-CN"));
        assertEquals("Tells you when to get off. Please keep this on.", TripLogic.channelDescription("alerts", "en-SG"));
        assertEquals("到了、分享停了、走了另一条路时告诉你。", TripLogic.channelDescription("info", "zh-CN"));
        assertEquals("Tells you when you arrive, when sharing stops, or when you take another way.", TripLogic.channelDescription("info", "en"));
        assertEquals("到站前提醒你下车。请不要关掉。", TripLogic.channelDescription("alerts", null)); // default zh
    }

    @Test
    public void ongoingAndActionCopy() {
        assertEquals("下车前我会提醒你。", TripLogic.ongoingText("ride", "zh-CN"));
        assertEquals("I'll tell you before your stop.", TripLogic.ongoingText("ride", "en-SG"));
        assertEquals("跟着屏幕走就好。", TripLogic.ongoingText("walk", "zh-CN"));
        assertEquals("Just follow the screen.", TripLogic.ongoingText("wait", "en-SG"));
        assertEquals("Just follow the screen.", TripLogic.ongoingText("last_walk", "en-SG"));
        assertEquals("行程进行中", TripLogic.ongoingTitle("zh-CN"));
        assertEquals("结束行程", TripLogic.endTripLabel("zh-CN"));
        assertEquals("End trip", TripLogic.endTripLabel("en-SG"));
        assertEquals("知道了", TripLogic.okLabel("zh-CN"));
        assertEquals("OK", TripLogic.okLabel("en-SG"));
        assertEquals(600_000L, TripLogic.ARRIVAL_TIMEOUT_MS);
        // The step title never carries coordinates even if a caller slips one in.
        assertEquals("坐 139 号 · 还有 3 站", TripLogic.clip("坐 139 号 · 还有 3 站 1.35210, 103.81980", 80));
    }
}
