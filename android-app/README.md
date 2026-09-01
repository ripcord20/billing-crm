# Fiberix Billing — APK Android

Aplikasi ini membungkus tampilan HP yang sudah ada (`https://fiberix.my.id/mobile`) jadi APK. Bukan rewrite native: login, pelanggan, pembayaran, isolir, tiket, NOC memakai UI `/mobile` yang sama.

## Pasang di HP

1. Unduh `Fiberix-Billing.apk` (hasil build debug).
2. Di HP: **Setelan → Keamanan → izinkan sumber tidak dikenal / Install unknown apps**.
3. Buka file APK → Install.
4. Login dengan akun staf Fiberix (admin / superadmin). Teknisi tetap masuk ke `/technician`.

Bukan unduhan Play Store. Sideload untuk tim internal.

## Bangun sendiri

Butuh JDK 17+ dan Android SDK (platform 34).

```bash
export ANDROID_SDK_ROOT="$HOME/android-sdk"
cd android-app
python3 scripts/gen-icons.py
./gradlew :app:assembleDebug
# hasil: app/build/outputs/apk/debug/app-debug.apk
```

Ubah URL jika domain berbeda: `MainActivity.START_URL`.

## Perilaku

- User-Agent berisi `FiberixBilling/1.0` → admin diarahkan ke `/mobile`.
- Cookie sesi disimpan di WebView (login tidak perlu diulang setiap buka, selama token berlaku).
- Unggah foto (KTP / rumah / tiket) lewat file picker HP.
- Unduhan invoice masuk folder Download.
- WhatsApp / tel / mailto dibuka di aplikasi sistem.
