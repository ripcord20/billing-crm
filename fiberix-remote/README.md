# Fiberix Remote

Aplikasi remote support mirip UltraViewer untuk **PC Windows** (yang dikendalikan) dan **HP Android** (yang mengendalikan).

- Windows: installer `dist/FiberixRemote-Setup.exe`
- Android: APK `dist/FiberixRemote.apk`
- ID + password tampil di jendela host (bukan RAT tersembunyi)
- Auto-reconnect, ID tidak berganti setelah internet putus

## 1. Relay (server, wajib nyala)

Di VPS atau PC yang IP-nya bisa diakses HP dan PC host:

```bash
cd fiberix-remote
npm install
npm start
```

Default port **18789**. Buka firewall port itu.

## 2. Windows — file installer EXE

Bangun di mesin Linux/Windows (butuh Node.js + [NSIS](https://nsis.sourceforge.io)):

```bash
cd fiberix-remote
npm install
npm run build:win
```

Hasil: `dist/FiberixRemote-Setup.exe`

Di PC pelanggan:

1. Jalankan installer (Next → Install)
2. Buka **Fiberix Remote** dari Desktop
3. Isi **Server relay** misalnya `192.168.22.99:18789` lalu **Simpan**
4. Berikan **ID** dan **Password** ke teknisi

Tidak perlu install Node.js di PC pelanggan. Capture layar memakai PowerShell; jalankan sebagai user yang sedang login.

## 3. Android — file APK

Bangun (butuh JDK 17+ dan Android SDK):

```bash
cd fiberix-remote
npm run build:apk
```

Hasil: `dist/FiberixRemote.apk`

Di HP teknisi:

1. Izinkan **Sumber tidak dikenal** / install APK
2. Buka **Fiberix Remote**
3. Isi server `IP:18789`, ID, dan password dari panel Windows
4. Kontrol layar dengan sentuhan

APK memakai WebView + WebSocket ke relay (boleh HTTP/IP lokal).

## Koneksi tahan putus

- Host dan viewer: WebSocket + heartbeat
- Putus → menyambung ulang sendiri
- Token host di `%USERPROFILE%\.fiberix-remote-host.json` (Windows) atau `~/.fiberix-remote-host.json`

Ini JPEG/BMP lewat WebSocket, bukan codec UltraViewer/RustDesk. Prioritas: **stabil dan mudah di-install**.

## Tes

```bash
cd fiberix-remote
npm test
```
