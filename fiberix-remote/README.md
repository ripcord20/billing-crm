# Fiberix Remote

Aplikasi remote support mirip UltraViewer untuk **PC Windows** (yang dikendalikan) dan **HP Android / PC lain** (yang mengendalikan).

Bukan RAT tersembunyi: ID + password tampil di jendela host, dan status “siap menerima” selalu kelihatan.

## Yang membuat koneksi tidak gampang putus

- Host dan viewer memakai **WebSocket + heartbeat**
- Jika internet putus, keduanya **menyambung ulang sendiri**
- ID host **tidak berganti** (token disimpan di `~/.fiberix-remote-host.json`)
- Kalau host sempat offline, viewer menunggu lalu lanjut tanpa isi ID lagi

Ini cukup untuk bantuan teknisi lewat jaringan yang sering putus. Bukan pengganti codec UltraViewer/RustDesk (H.264 + UDP). Untuk kualitas video tinggi, RustDesk lebih unggul; Fiberix Remote diutamakan **stabil dan sederhana**.

## Cara jalan

### 1. Relay (server yang selalu nyala)

Di VPS atau PC billing yang IP-nya bisa diakses HP:

```bash
cd fiberix-remote
npm install
npm start
```

Default port **18789**. Buka firewall port itu. Viewer: `http://IP-SERVER:18789/`

### 2. Host di Windows (PC yang dibantu)

1. Install [Node.js LTS](https://nodejs.org)
2. Copy folder `fiberix-remote` ke PC Windows
3. Set alamat relay, lalu jalankan agen:

```bat
set REMOTE_RELAY=ws://IP-SERVER:18789/ws
host\start-windows.bat
```

4. Jendela `http://127.0.0.1:18080` menampilkan **ID** dan **Password**
5. Berikan ID + password ke teknisi

### 3. Android (yang mengendalikan)

1. Buka Chrome: `http://IP-SERVER:18789/`
2. Menu Chrome → **Tambahkan ke layar utama** (jadi aplikasi)
3. Ketik ID + password, lalu kontrol layar dengan sentuhan

Viewer yang sama juga jalan di Windows/Linux lewat browser.

## Catatan Windows

- Capture layar memakai PowerShell (`System.Drawing`). Kualitas sedang, hemat CPU.
- Mouse/keyboard dikirim ke PC host.
- Jalankan host sebagai user yang sedang login (bukan service sesi 0).
- Antivirus kadang menahan simulasi input; izinkan Node.js jika diminta.

## Mode demo (bukan Windows)

`node host/agent.js` di Linux tetap menyambung ke relay dan mengirim frame uji, supaya viewer/reconnect bisa dites tanpa PC Windows.
