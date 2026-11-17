package com.wwweeeiii.howtogo;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.os.Build;
import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

/**
 * One app-wide Android TextToSpeech (M6 AC 8): navigation-guidance audio attributes, ducks other
 * audio while speaking, works with the screen locked (it runs on the app context, not the WebView).
 */
final class Speaker {
    interface Done {
        void done(boolean ok);
    }

    private static Speaker instance;

    static synchronized Speaker get(Context ctx) {
        if (instance == null) instance = new Speaker(ctx.getApplicationContext());
        return instance;
    }

    private final AudioManager audio;
    private final AudioAttributes attrs = new AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE)
        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
        .build();
    private final TextToSpeech tts;
    private volatile boolean ready = false;
    private volatile boolean failed = false;
    private final List<Runnable> pending = new ArrayList<>();
    private final Map<String, Done> callbacks = new ConcurrentHashMap<>();
    private final AtomicLong seq = new AtomicLong();
    private AudioFocusRequest focus;

    private Speaker(Context app) {
        audio = (AudioManager) app.getSystemService(Context.AUDIO_SERVICE);
        tts = new TextToSpeech(app, status -> {
            List<Runnable> run;
            synchronized (this) {
                ready = status == TextToSpeech.SUCCESS;
                failed = !ready;
                run = new ArrayList<>(pending);
                pending.clear();
            }
            for (Runnable r : run) r.run();
        });
        tts.setAudioAttributes(attrs);
        tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
            @Override
            public void onStart(String id) {}

            @Override
            public void onDone(String id) {
                finish(id, true);
            }

            @Override
            public void onError(String id) {
                finish(id, false);
            }

            @Override
            public void onStop(String id, boolean interrupted) {
                finish(id, false);
            }
        });
    }

    private void whenReady(Runnable r) {
        synchronized (this) {
            if (!ready && !failed) {
                pending.add(r);
                return;
            }
        }
        r.run();
    }

    private void finish(String id, boolean ok) {
        Done d = callbacks.remove(id);
        if (callbacks.isEmpty()) abandonFocus();
        if (d != null) d.done(ok);
    }

    private static Locale locale(String lang) {
        if (lang != null && lang.startsWith("en")) return Locale.forLanguageTag("en-SG");
        return Locale.SIMPLIFIED_CHINESE;
    }

    /** True when the engine has (or can download) a voice for the language. */
    static boolean available(int r) {
        return r == TextToSpeech.LANG_AVAILABLE || r == TextToSpeech.LANG_COUNTRY_AVAILABLE || r == TextToSpeech.LANG_COUNTRY_VAR_AVAILABLE;
    }

    void voices(java.util.function.BiConsumer<Boolean, Boolean> cb) {
        whenReady(() -> {
            if (!ready) {
                cb.accept(false, false);
                return;
            }
            boolean zh = available(tts.isLanguageAvailable(Locale.SIMPLIFIED_CHINESE));
            boolean en = available(tts.isLanguageAvailable(Locale.forLanguageTag("en-SG"))) || available(tts.isLanguageAvailable(Locale.ENGLISH));
            cb.accept(zh, en);
        });
    }

    /** flush = high priority (interrupts). Rate: zh 0.9, en 0.92 (STYLE-GUIDE §3). */
    void speak(String text, String lang, boolean flush, Done done) {
        whenReady(() -> {
            if (!ready || text == null || text.isEmpty()) {
                if (done != null) done.done(false);
                return;
            }
            Locale loc = locale(lang);
            int r = tts.setLanguage(loc);
            if (r == TextToSpeech.LANG_MISSING_DATA || r == TextToSpeech.LANG_NOT_SUPPORTED) {
                if (done != null) done.done(false);
                return;
            }
            tts.setSpeechRate(lang != null && lang.startsWith("en") ? 0.92f : 0.9f);
            String id = "u" + seq.incrementAndGet();
            if (done != null) callbacks.put(id, done);
            requestFocus();
            Bundle params = new Bundle();
            params.putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, 1f);
            int res = tts.speak(text, flush ? TextToSpeech.QUEUE_FLUSH : TextToSpeech.QUEUE_ADD, params, id);
            if (res != TextToSpeech.SUCCESS) finish(id, false);
        });
    }

    void stop() {
        if (ready) tts.stop();
        for (String id : callbacks.keySet()) finish(id, false);
    }

    private void requestFocus() {
        if (audio == null) return;
        if (Build.VERSION.SDK_INT >= 26) {
            if (focus == null) {
                focus = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK).setAudioAttributes(attrs).build();
            }
            audio.requestAudioFocus(focus);
        } else {
            audio.requestAudioFocus(null, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK);
        }
    }

    private void abandonFocus() {
        if (audio == null) return;
        if (Build.VERSION.SDK_INT >= 26) {
            if (focus != null) audio.abandonAudioFocusRequest(focus);
        } else {
            audio.abandonAudioFocus(null);
        }
    }
}
