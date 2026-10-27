# Play Store — ZTE SSH 1.1.0 (`id.fiberix.zteshell`)

APK `ZTE-SSH (6).apk` / `ZTE-SSH.apk` versi **1.1.0** (versionCode **8**) sudah memenuhi syarat teknis unggah 2026. **Jangan unggah APK.** Unggah **AAB**. Lolos review tetap keputusan Google.

Pengecekan ChatGPT pada file (4) = versi lama **1.0.5 / API 34** — itu yang salah target. File (6) = **1.1.0 / API 36** — itu yang dipakai.

## Status bedah APK 1.1.0 (27 Okt 2026, 23:11 WIB)

| Item | Hasil | Upload? |
|---|---|---|
| Package | `id.fiberix.zteshell` | Siap |
| Version | 1.1.0 / code 8 | Siap |
| Min / target / compile | 24 / **36** / **36** | Siap |
| Signed (APK v2) | Ya, RSA 2048, CN=ZTE SSH / Fiberix | Siap, **simpan keystore ini** |
| AAB | `frontend/public/apk/ZTE-SSH.aab` | **Ini yang diunggah** |
| Native `.so` | Tidak ada | Siap (16 KB page N/A) |
| Iklan / Firebase / Crashlytics / Sentry SDK | Tidak ada | Siap |
| URL/server tertanam | Tidak ada. Koneksi hanya ke IP yang user ketik | Siap |
| LoginActivity | Form lokal (IP OLT), bukan akun Fiberix | Isi “App access” di bawah |
| FGS `specialUse` | Ada, stoppable dari notifikasi | **Wajib deklarasi Console** |
| Cleartext | `true` karena **Telnet port 23** ke IP sembarang | **Jangan dihapus** |
| Akun Personal baru | Closed test 12 tester × 14 hari | **Bukan urusan APK** |

Library di DEX: JSch (`com.jcraft`) untuk SSH, Apache Commons Net `TelnetClient` untuk C320. `http://` di binary bukan panggilan API Fiberix.

## 1. Yang diunggah

Play Console → **Test and release** (Internal / Closed / Production) → Create release → unggah:

`frontend/public/apk/ZTE-SSH.aab`

bukan `ZTE-SSH.apk`.

Aktifkan **Play App Signing**. Upload key = keystore yang menandatangani AAB ini (`keystore/zte-ssh-release.jks` di mesin yang membangun, alias `zteshell`). **Jangan generate keystore baru** di komputer lain lalu unggah AAB kedua — Play akan menolak.

## 2. Closed testing (akun Personal setelah 13 Nov 2023)

Google mewajibkan ini **sebelum** Production:

1. Create app selesai, AAB di **Closed testing**.
2. Tambah **minimal 12 tester** (Gmail) yang opt-in dan tetap terpasang **14 hari berturut-turut**.
3. Baru tombol minta akses Production muncul.

Tanpa 12×14 hari, review Production tidak jalan. Ini kebijakan akun, bukan bug APK.

## 3. Store listing — tempel apa adanya

**Nama:** ZTE SSH  
**Short (80):** Konsol SSH/Telnet untuk OLT ZTE C300/C320 di LAN atau VPN.  
**Full:**

ZTE SSH adalah konsol teknisi untuk login SSH atau Telnet langsung ke OLT ZTE C300/C320 di jaringan lapangan.

HP harus satu Wi-Fi atau VPN dengan OLT. Aplikasi tidak meneruskan perintah lewat server cloud.

Fitur: saran perintah CLI C300, riwayat panah atas/bawah, salin dan tempel, sesi tetap hidup saat pindah ke aplikasi lain (bisa dihentikan dari notifikasi).

C320 sering Telnet port 23. SSH memakai port 22. Telnet di LAN tidak terenkripsi (sifat protokol).

**Kategori:** Tools  
**Tag:** SSH, Telnet, OLT, ZTE, jaringan  
**Email kontak:** (isi email Fiberix yang dipantau)  
**Situs / privasi:** URL publik `/apk/privacy.html` (lihat bawah)  
**Ikon 512:** `android-zte-ssh/play/icon-512.png`  
**Feature graphic 1024×500:** `android-zte-ssh/play/feature-1024x500.png`  
**Screenshot:** minimal 2 dari **HP nyata** (layar profil + terminal). Jangan pakai mockup.

## 4. Kebijakan privasi (wajib URL publik)

Play **mengunduh URL dari internet**. Repo privat = 404 = ditolak.

- Setelah CRM live: `https://<domain-fiberix>/apk/privacy.html`
- Kalau repo GitHub **public**: `https://raw.githubusercontent.com/ripcord20/billing-crm/cursor/zte-ssh-apk-9481/frontend/public/apk/privacy.html`

Tempel URL yang sama di Store listing **dan** App content → Privacy policy. Di aplikasi sudah ada layar Kebijakan privasi.

## 5. App content — tempel

### Iklan
Tidak berisi iklan.

### Target usia / Content rating (IARC)
Aplikasi utilitas teknisi, tanpa kekerasan, seksual, bahasa kasar, narkoba, UGC publik, atau lokasi. Selesai kuesioner → rating yang keluar biasanya **Everyone / 3+**.

### App access (login)
**Tidak memerlukan akun.** Semua UI terbuka tanpa daftar.

Catatan untuk reviewer (tempel di “All or some functionality is restricted” **hanya jika** mereka memaksa instruksi; default pilih **tidak dibatasi**):

```
This app has no user account and no cloud backend.
The first screen is a local OLT profile form (IP, username, password of the technician’s own ZTE OLT).
Reviewers can open every screen. Tapping Connect without a reachable OLT on the same LAN/VPN shows a connection error — that is expected.
There is no demo Fiberix login.
```

### Data safety

| Pertanyaan | Jawaban |
|---|---|
| Mengumpulkan data pengguna? | **Tidak** |
| Data dikirim ke developer / pihak ketiga? | **Tidak** |
| Enkripsi in transit | SSH ya. Telnet tidak (protokol LAN ke IP yang user ketik) |
| Enkripsi at rest | Ya, Android Keystore AES-GCM |
| User bisa hapus | Ya — hapus profil atau uninstall |
| Ditujukan ke anak | Tidak |
| Akun, analitik, iklan, lokasi, foto, mikrofon | Tidak |

Jangan centang “App activity” / “Crash logs” / “Device IDs”. Kredensial OLT **tidak collected** (hanya di HP).

### Foreground service — Special use

Pilih **Special use**, **bukan** dataSync.

**Deskripsi (EN, tempel):**

```
The user starts an SSH or Telnet session to a ZTE OLT they typed themselves.
OltKeepAliveService keeps that session alive only while connected, so the technician can switch to WhatsApp or notes to copy CLI commands and return.
A persistent notification is shown. The user can stop the session from the notification action “Putuskan”.
The service is not used for ads, location, or background data sync.
```

**Video 20–40 detik (wajib jika Console minta):** buka app → Hubungkan ke OLT lab → pindah ke app lain → tarik notifikasi “ZTE SSH terhubung” → ketuk Putuskan → sesi mati.

Properti manifest sudah:

`Keeps a user-started SSH/Telnet session to a selected OLT alive while the technician copies CLI commands from another app. Stoppable from the notification.`

### Photo / video / kamera
Tidak. Jangan deklarasikan.

## 6. Cleartext — jangan dimatikan

`usesCleartextTraffic=true` **sengaja** untuk Telnet ke IP OLT yang diketik user (C320 port 23). Android tidak bisa membatasi cleartext per CIDR/port. SSH tetap terenkripsi JSch. Tidak ada HTTP ke server Fiberix.

Kalau dimatikan, Telnet C320 di LAN gagal.

## 7. Urutan klik di Console

1. Create app (nama ZTE SSH, App, gratis, email).
2. Tempel privasi URL publik.
3. Data safety, rating, iklan, FGS specialUse, App access.
4. Store listing + ikon + graphic + 2 screenshot HP.
5. Unggah **AAB** ke Closed testing (Personal) atau Internal testing dulu.
6. 12 tester × 14 hari jika akun Personal baru.
7. Production → Send for review.

## Bukan jaminan lolos

Reviewer manusia bisa minta klarifikasi FGS atau URL privasi yang belum online. APK (6) secara teknis sudah benar; yang tersisa adalah isi Console + tester + screenshot HP.
