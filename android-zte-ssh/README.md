# ZTE SSH — APK Android

Aplikasi konsol **SSH / Telnet** untuk OLT ZTE C300 / C320. Bukan WebView CRM: HP terhubung langsung ke IP OLT (jaringan lapangan atau VPN).

Handshake SSH memakai algoritma OLT lama (ssh-rsa, group1, 3des) plus keyboard-interactive, sama seperti klien CLI Fiberix.

## Unduh

Langsung dari GitHub (tanpa menunggu deploy CRM):

- APK: https://github.com/ripcord20/billing-crm/raw/cursor/zte-ssh-apk-9481/frontend/public/apk/ZTE-SSH.apk
- ZIP (jika Chrome memblokir APK): https://github.com/ripcord20/billing-crm/raw/cursor/zte-ssh-apk-9481/frontend/public/apk/ZTE-SSH.zip

Setelah CRM di-deploy: **OLT Management → Unduh APK SSH** membuka `/apk/` (tombol APK + ZIP).

Sideload internal, bukan Play Store. Izinkan pasang dari sumber tidak dikenal, lalu Install. Kalau Chrome bilang file berbahaya, pilih Unduh anyway atau pakai ZIP.

## Cara pakai

1. HP harus satu Wi-Fi / VPN dengan OLT.
2. Isi IP, user, password → **Hubungkan**. Profil tersimpan di HP.
3. C320 sering **Telnet port 23**; SSH port 22.
4. Password enable opsional — dikirim setelah `terminal length 0`.
5. Chip perintah: `show card`, `show gpon onu uncfg`, `show processor`, dll.
6. **Salin** = copy output terminal ke clipboard (kalau ada teks terpilih, hanya itu).
7. **Tempel** = paste ke kotak perintah. Bisa tempel banyak baris dari WhatsApp/catatan, lalu **Kirim** — dikirim satu per satu.
8. Long-press output juga bisa pilih teks (salin sistem Android).

## Bangun sendiri

Butuh JDK 17+ dan Android SDK (platform 34).

```bash
export ANDROID_SDK_ROOT="$HOME/android-sdk"
cd android-zte-ssh
./scripts/build-apk.sh
# hasil: app/build/outputs/apk/release/app-release.apk
```

Keystore `keystore/zte-ssh-release.jks` digenerate saat build, tidak masuk git.

## Catatan

- HP harus bisa meraih IP OLT (Wi-Fi POP / VPN). Aplikasi ini tidak lewat server Fiberix.
- Profil (termasuk password) disimpan lokal di HP, `allowBackup=false`.
- `--More--` dijawab spasi otomatis.
