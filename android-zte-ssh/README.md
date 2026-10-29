# ZTE SSH — APK Android

Aplikasi konsol **SSH / Telnet** untuk OLT ZTE C300 / C320. Bukan WebView CRM: HP terhubung langsung ke IP OLT (jaringan lapangan atau VPN).

Handshake SSH memakai algoritma OLT lama (ssh-rsa, group1, 3des) plus keyboard-interactive, sama seperti klien CLI Fiberix.

Versi **1.2.1** menargetkan Android 16 (`targetSdk 36`) dan paket AAB untuk unggah Play Store. Pustaka skrip CLI tersimpan di HP (nama, catatan, perintah, placeholder `{SN}`). Kotak perintah di baris penuh di bawah tombol. Langkah Console: [PLAY_STORE.md](PLAY_STORE.md).

## Unduh

Langsung dari GitHub (tanpa menunggu deploy CRM):

- APK: https://github.com/ripcord20/billing-crm/raw/cursor/zte-ssh-apk-9481/frontend/public/apk/ZTE-SSH.apk
- ZIP (jika Chrome memblokir APK): https://github.com/ripcord20/billing-crm/raw/cursor/zte-ssh-apk-9481/frontend/public/apk/ZTE-SSH.zip
- Kebijakan privasi: https://github.com/ripcord20/billing-crm/raw/cursor/zte-ssh-apk-9481/frontend/public/apk/privacy.html

Setelah CRM di-deploy: **OLT Management → Unduh APK SSH** membuka `/apk/` (tombol APK + ZIP). Privasi: `/apk/privacy.html`.

Sideload internal tetap didukung. Play Store memakai file **AAB**, bukan APK.

## Cara pakai

1. HP harus satu Wi-Fi / VPN dengan OLT.
2. Isi IP, user, password → **Hubungkan**. Profil tersimpan terenkripsi di HP (Android Keystore).
3. C320 sering **Telnet port 23**; SSH port 22.
4. Password enable opsional — dikirim setelah `terminal length 0`.
5. Ketuk kotak perintah atau layar terminal supaya keyboard muncul, lalu ketik. Chip: `show card`, `show gpon onu uncfg`, `show processor`, dll. Panah **atas** = perintah terakhir, panah **bawah** = berikutnya. Saran perintah muncul di atas kotak; kata salah (yang sudah selesai) digarisbawahi merah.
5b. **Pustaka skrip** (tombol Skrip di terminal, atau di layar login): simpan dokumentasi + perintah ONT. Placeholder `{PON}` `{SN}` diisi saat mengambil. Skrip masuk ke kotak dulu — baru **Kirim** ke OLT.
6. Boleh pindah ke WhatsApp/catatan — keepalive SSH + notifikasi menjaga sesi. Hentikan dari **Putuskan** di notifikasi.
7. **Salin** = copy output terminal ke clipboard (kalau ada teks terpilih, hanya itu).
8. **Tempel** = paste ke kotak perintah. Bisa tempel banyak baris dari WhatsApp/catatan, lalu **Kirim** — dikirim satu per satu.
9. Long-press output juga bisa pilih teks (salin sistem Android).

## Bangun sendiri

Butuh JDK 17+ dan Android SDK (platform 36).

```bash
export ANDROID_SDK_ROOT="$HOME/android-sdk"
cd android-zte-ssh
./scripts/build-apk.sh
# APK: app/build/outputs/apk/release/app-release.apk
# AAB (Play): app/build/outputs/bundle/release/app-release.aab
```

Keystore `keystore/zte-ssh-release.jks` digenerate saat build, tidak masuk git. Untuk Play, pakai **satu** upload key yang disimpan aman (lihat PLAY_STORE.md).

## Catatan

- HP harus bisa meraih IP OLT (Wi-Fi POP / VPN). Aplikasi ini tidak lewat server Fiberix.
- Profil (termasuk password) disimpan lokal, dienkripsi, `allowBackup=false`.
- `--More--` dijawab spasi otomatis.
