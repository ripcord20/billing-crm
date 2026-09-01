# Fiberix — APK Android

Aplikasi ini membuka **situs Fiberix yang sama** (`https://fiberix.my.id`) di WebView: dashboard, sidebar, dan semua modul seperti di browser. Bukan tampilan `/mobile` yang modulnya lebih sedikit.

## Pasang di HP

1. **Hapus dulu** APK lama (build debug v1) bila masih terpasang — tanda tangan rilis berbeda, jadi tidak bisa di-update menimpa.
2. Unduh `Fiberix.apk`.
3. Buka file APK → Install. Installer hanya butuh akses internet (tidak minta lokasi, SMS, atau penyimpanan).
4. Login dengan akun staf Fiberix. Setelah login, home mengikuti peran seperti di web (`/dashboard`, `/noc`, `/sales`, dll.).

Sideload untuk tim internal, bukan unduhan Play Store. Play Protect tetap bisa menanya karena aplikasi belum di Play Store — itu normal.

## Bangun sendiri

Butuh JDK 17+ dan Android SDK (platform 34).

```bash
export ANDROID_SDK_ROOT="$HOME/android-sdk"
cd android-app
./scripts/build-apk.sh
# hasil: app/build/outputs/apk/release/app-release.apk
```

Build rilis, ditandatangani keystore internal (`keystore/fiberix-release.jks`, tidak masuk git). Jangan pakai `assembleDebug` untuk dibagikan ke staf.

## Perilaku

- User-Agent berisi `Fiberix/2.0`. Login tidak diarahkan ke `/mobile`.
- Cookie sesi disimpan di WebView.
- Unggah foto lewat file picker HP.
- Unduhan invoice masuk folder Download (Android 10+).
- Tautan di luar `fiberix.my.id`, plus WhatsApp / tel / mailto, dibuka di aplikasi sistem.
