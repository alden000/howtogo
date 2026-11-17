# R8 keep rules (M6 AC 35). Capacitor's consumer rules already keep @CapacitorPlugin classes,
# @PluginMethod / @PermissionCallback methods and Plugin subclasses; these are belt and braces for ours.

# Our plugin: the bridge finds methods by name via reflection.
-keep class com.wwweeeiii.howtogo.TripPlugin { *; }
-keep class com.wwweeeiii.howtogo.MainActivity { *; }
# Manifest component (also kept by AAPT rules) and its intent actions.
-keep class com.wwweeeiii.howtogo.TripService { *; }

# Capacitor bridge core (reflection: plugin handles, annotations, JS interface).
-keep class com.getcapacitor.** { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# play-services-location ships its own consumer rules; keep the parcelables used across IPC.
-keep class com.google.android.gms.location.** { *; }
-dontwarn com.google.android.gms.**

# Release logcat: drop verbose/debug logging (AC 37); Log.i hook lines stay (hook names only).
-assumenosideeffects class android.util.Log {
    public static int v(...);
    public static int d(...);
}
