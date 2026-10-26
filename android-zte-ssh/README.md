# ZTE SSH — APK Android

Aplikasi konsol **SSH / Telnet** untuk OLT ZTE C300 / C320. Bukan WebView CRM: HP terhubung langsung ke IP OLT (jaringan lapangan atau VPN).

Handshake SSH memakai algoritma OLT lama (ssh-rsa, group1, 3des) plus keyboard-interactive, sama seperti klien CLI Fiberix.

## Pasang di HP

1. Unduh `ZTE-SSH.apk` (hasil build rilis).
2. Izinkan pasang dari sumber tidak dikenal, lalu Install.
3. Isi IP OLT, username, password. ZTE C320 sering Telnet port 23; SSH port 22.
4. Password enable opsional — dikirim setelah `terminal length 0`.
5. Chip perintah: `show card`, `show gpon onu uncfg`, `show processor`, dll.

Sideload internal, bukan Play Store.

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
