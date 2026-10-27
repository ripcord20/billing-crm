# Play Store — ZTE SSH (`id.fiberix.zteshell`) 1.1.0

Kode ini memenuhi syarat teknis unggah 2026 (target API 36, AAB, FGS `specialUse`, kredensial terenkripsi, kebijakan privasi). **Lolos review tetap keputusan Google**, bukan jaminan otomatis.

## Yang harus diisi di Play Console

### App bundle
Unggah `app/build/outputs/bundle/release/app-release.aab` (bukan APK). Aktifkan Play App Signing. Simpan **satu** upload keystore selamanya — jangan pakai keystore acak dari CI.

```bash
cd android-zte-ssh
./scripts/build-apk.sh   # APK sideload + AAB
```

### Target API
`targetSdk 36` / `compileSdk 36` (Android 16). Wajib untuk aplikasi baru sejak 31 Agu 2026.

### Kebijakan privasi (URL publik)
Tempel URL halaman ini di Store listing **dan** di App content → Privacy policy:

- Setelah CRM live: `https://<domain-fiberix>/apk/privacy.html`
- Sementara dari repo: `https://raw.githubusercontent.com/ripcord20/billing-crm/cursor/zte-ssh-apk-9481/frontend/public/apk/privacy.html`

Di aplikasi: layar **Kebijakan privasi** dari tautan di halaman login.

### Data safety
| Pertanyaan | Jawaban |
|---|---|
| Mengumpulkan data pengguna? | **Tidak** (kredensial hanya di perangkat, tidak dikirim ke developer) |
| Enkripsi in transit? | SSH: ya. Telnet: tidak (protokol LAN) |
| Enkripsi at rest? | Ya (Android Keystore AES-GCM) |
| Data bisa dihapus? | Ya — hapus profil / uninstall |
| Anak-anak? | Tidak ditujukan ke anak |
| Akun / analitik / iklan / lokasi / foto | Tidak |

Kalau form memaksa kategori: **App activity** tidak. **App info and performance** tidak. Kredensial OLT = data perangkat lokal, bukan collected.

### Foreground service — special use
Play Console → App content → Foreground service declaration:

- Tipe: **Special use**
- Video / deskripsi: teknisi menekan Hubungkan, pindah ke WhatsApp/catatan untuk menyalin perintah CLI, kembali; sesi OLT tetap hidup. Notifikasi menampilkan **Putuskan**.
- Teks properti manifest (sudah di `AndroidManifest.xml`):
  `Keeps a user-started SSH/Telnet session to a selected OLT alive while the technician copies CLI commands from another app. Stoppable from the notification.`

Jangan pilih `dataSync`. Itu ditolak untuk SSH.

### Photo / video permissions
Tidak dipakai. Jangan deklarasikan kamera/galeri.

### Store listing
- Nama: ZTE SSH
- Short: Konsol SSH/Telnet OLT ZTE C300/C320 di LAN/VPN
- Full: Aplikasi teknisi untuk login SSH atau Telnet ke OLT ZTE di jaringan lapangan. HP harus satu Wi-Fi/VPN dengan OLT. Bukan remote lewat internet publik. Saran perintah C300, riwayat panah atas/bawah, salin/tempel.
- Kategori: Tools / Productivity
- Ikon 512: `android-zte-ssh/play/icon-512.png`
- Feature graphic 1024×500: `android-zte-ssh/play/feature-1024x500.png`
- Screenshot: minimal 2 dari HP nyata (login + terminal). Play menolak screenshot palsu.

### Content rating
Questionnaire: utility, no user-generated public content, no ads.

## Bukan jaminan lolos
Reviewer manusia bisa minta klarifikasi FGS, Telnet cleartext, atau URL privasi yang belum online. Siapkan video 30 detik: buka app → Hubungkan (boleh OLT lab) → pindah app → notifikasi masih ada → Putuskan.
