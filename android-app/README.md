# Fiberix — APK Android

Dua aplikasi WebView rilis (bukan debug), izin hanya internet:

| APK | Package | Isi |
|-----|---------|-----|
| `Fiberix.apk` | `id.fiberix.billing` | Situs staf: dashboard + semua modul |
| `Fiberix-Pelanggan.apk` | `id.fiberix.pelanggan` | Portal pelanggan `/portal` (tagihan, bayar, tiket, WiFi) |

## Staf (`Fiberix.apk`)

1. Hapus APK debug lama bila masih terpasang.
2. Unduh `Fiberix.apk`, install, login akun staf.
3. Home mengikuti peran seperti di web (`/dashboard`, `/noc`, `/sales`, …).

## Pelanggan PPPoE (`Fiberix-Pelanggan.apk`)

1. Unduh `Fiberix-Pelanggan.apk` (atau tautan di `/portal/login`).
2. Login dengan **ID pelanggan**, **nomor HP**, atau **username PPPoE**. Password awal = nomor HP terdaftar.
3. Bukan Play Store. Installer tidak minta lokasi/SMS. Play Protect bisa menanya karena sideload.

## Bangun sendiri

Butuh JDK 17+ dan Android SDK (platform 34).

```bash
export ANDROID_SDK_ROOT="$HOME/android-sdk"
cd android-app
./scripts/build-apk.sh
# hasil:
#   app/build/outputs/apk/release/app-release.apk
#   pelanggan/build/outputs/apk/release/pelanggan-release.apk
```

Ditandatangani keystore internal (`keystore/fiberix-release.jks`, tidak masuk git).

## Perilaku

- Staf UA `Fiberix/2.0` — tidak diarahkan ke `/mobile`.
- Pelanggan UA `FiberixPelanggan/1.0` — tetap di `/portal`. Pembayaran Midtrans/Duitku/Tripay tetap di dalam aplikasi; WhatsApp/tel dibuka di aplikasi sistem.
