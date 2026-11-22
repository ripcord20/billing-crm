# Fiberix Remote

Aplikasi remote support mirip UltraViewer untuk **PC Windows** (yang dikendalikan) dan **HP Android** (yang mengendalikan).

- Windows: installer `dist/FiberixRemote-Setup.exe` (ditandatangani Authenticode)
- Android: APK `dist/FiberixRemote.apk`
- Panel host sederhana: ID, Password, Unattended access
- Auto-reconnect, ID tidak berganti setelah internet putus

## 1. Relay cloud (sekali di VPS, pengguna tidak mengisi alamat)

UltraViewer menyembunyikan alamat server. Fiberix sama: Windows dan Android sudah mengarah ke `103.195.65.216:18789`.

Di VPS itu, jalankan terus:

```bash
cd fiberix-remote
npm install
npm start
```

Buka firewall **TCP 18789**. Pelanggan dan teknisi hanya memakai ID + password.

## 2. Windows

```bash
cd fiberix-remote
npm install
npm run build:win
```

Hasil: `dist/FiberixRemote-Setup.exe`

Installer memakai **Node.js resmi** (bukan packer `pkg`, yang sering kena antivirus) + tanda tangan Authenticode.

Di PC pelanggan: Next → Install → panel **Allow Remote Control** muncul (ID + password, tanpa alamat server).

Opsi Unattended:

- Run Fiberix Remote with Windows
- Prevent Windows from going to sleep
- Allow turn on computer remotely (Wake-on-LAN, butuh BIOS)
- Custom Password (4–8 digit)

## Tanda tangan & antivirus

Installer ditandatangani sertifikat kode Fiberix (self-signed) + timestamp jika jaringan mengizinkan.

Tanpa sertifikat **EV/OV** berbayar dari DigiCert/Sectigo, Windows SmartScreen tetap bisa menampilkan “Unknown publisher” di **pertama kali** buka. Setelah pelanggan pilih **More info → Run anyway**, reputasi file biasanya naik.

Runtime di dalam installer adalah `node.exe` resmi Node.js (sudah ditandatangani OpenJS), bukan executable yang dikompresi packer.

Untuk lolos SmartScreen penuh di semua PC baru: pasang sertifikat kode berbayar, lalu:

```bash
osslsigncode sign -pkcs12 Fiberix-EV.pfx -pass "..." -n "Fiberix Remote" \
  -t http://timestamp.digicert.com -in dist/FiberixRemote-Setup.exe -out dist/FiberixRemote-Setup.exe
```

## 3. Android

`npm run build:apk` → `dist/FiberixRemote.apk`

## Tes

```bash
cd fiberix-remote
npm test
```
