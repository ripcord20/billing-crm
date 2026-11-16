# Panduan: CORE 2 pakai IP public static (tanpa WireGuard)

Tujuan: Fiberix kelola CORE 2 dan auth PPPoE Fiberix **tanpa** VPS hub WireGuard (`103.169.206.24` / `10.201.0.x`).

WireGuard adalah jalan ke IP private. IP public static di CORE 2 **saja** tidak cukup. Harus ada jalan di **dua arah**, dan firewall hanya dari IP lawan — jangan `0.0.0.0/0`.

Sesi PPPoE yang sudah online lewat BillingRadius **jangan dipindah** sebelum tes 1 user sukses.

## 0. Inventaris (isi / cek ulang)

Nilai di bawah sesuai kondisi Fiberix + CORE 2 saat panduan ini ditulis. Ganti jika ISP / NAT berubah.

| Peran | Nilai sekarang | Wajib static? |
|---|---|---|
| CORE 2 nama | CORE 2 (RouterOS 7.22) | — |
| CORE 2 WAN lokal | `172.127.2.2/30` (vlan1272) | — |
| CORE 2 IP public | `144.79.228.137` | **Ya** (konfirmasi ISP: bukan CGNAT / tidak ganti tiap reconnect) |
| CORE 2 REST/www | TCP `8088` | — |
| CORE 2 Winbox | TCP `8291` (public `:1272` saat ini NAT ke host lain yang mati — lihat §2.3) | — |
| CORE 2 API biner | TCP `8872` | — |
| Billing Fiberix LAN | `192.168.22.99` | — |
| Billing Fiberix public | `103.195.65.216` (SSH 2221, HTTP 80/443 sudah masuk ke `22.99`) | **Ya** |
| FreeRADIUS auth | `192.168.22.99` UDP **1812** | — |
| Accounting Node | `192.168.22.99` UDP **1813** | — |
| RADIUS yang dipakai PPPoE hari ini | BillingRadius `172.20.1.1` (L2TP) | Jangan dimatikan dulu |
| NAS Fiberix sekarang | `nasname=10.201.0.2` (IP tunnel WG) | Akan diganti ke IP public CORE 2 |

Tentukan dua IP yang **tidak boleh berubah**:

1. `CORE2_PUB` = IP public static CORE 2 (contoh `144.79.228.137`)
2. `FX_PUB` = IP public static kantor/VPS Fiberix (contoh `103.195.65.216`)

Cek dari CORE 2:

```routeros
/ip cloud print
/ip address print where interface~"vlan1272"
/ip firewall nat print where comment~"WINBOX"
```

Cek dari laptop/kantor: `ping 144.79.228.137` dan pastikan hasilnya **mesin CORE 2**, bukan modem orang lain.

Jika `144.79.228.137` berubah setelah reboot/PPPoE uplink: itu **bukan** static. Sewa IP static dulu, baru lanjut.

## 1. Gambar jalur (tanpa WG)

```
Pelanggan PPPoE
      |
   CORE 2  (WAN public CORE2_PUB)
      |  UDP 1812/1813  ---------------------->  FX_PUB  --DNAT-->  192.168.22.99:1812/1813
      |                                                      (FreeRADIUS + accounting Node)
      |
Fiberix Device Management
   192.168.22.99  --TCP 8088/8291------------>  CORE2_PUB
   (hanya dari IP kantor)
```

Dua sisi itu **saling kebalikan**. Satu sisi saja = timeout / “Belum terhubung”.

---

## 2. Sisi A — Fiberix kelola CORE 2 (API / Winbox)

### 2.1 Firewall di CORE 2 (wajib)

Ganti `FX_PUB` jika IP public kantor bukan `103.195.65.216`.

Jangan buka Winbox/API ke seluruh internet.

```routeros
/ip firewall address-list
add list=FIBERIX-MGMT address=103.195.65.216 comment="kantor/VPS Fiberix"

/ip firewall filter
add chain=input action=accept protocol=tcp dst-port=8088,8291,8872 \
    src-address-list=FIBERIX-MGMT comment="FIBERIX-MGMT" place-before=0
add chain=input action=drop protocol=tcp dst-port=8291,8088,8872 \
    comment="drop winbox/api selain Fiberix"
```

`place-before=0` menaruh rule di atas drop/fasttrack yang menolak. Cek `/ip firewall filter print` — rule accept harus **sebelum** drop.

Kalau admin masih Winbox dari IP lain (rumah, HP), tambahkan IP itu ke list `FIBERIX-MGMT`. Jangan hapus akses admin sebelum tes Winbox dari IP baru.

### 2.2 Service CORE 2

```routeros
/ip service
set www port=8088 disabled=no
set winbox port=8291 disabled=no address=0.0.0.0/0
```

`address=0.0.0.0/0` di service **boleh** asal filter §2.1 yang membatasi. Jangan matikan `www` di `8088` — Device Management Fiberix pakai REST HTTP.

### 2.3 Perbaiki NAT Winbox public (opsional tapi penting)

Sekarang ada:

`dstnat tcp 144.79.228.137:1272 → 192.168.16.2:8291` (host `192.168.16.2` tidak hidup).

Kalau maksud port `1272` adalah **Winbox CORE 2 sendiri**:

```routeros
/ip firewall nat
set [find comment="WINBOX" dst-port=1272] action=redirect to-ports=8291 \
    to-addresses="" comment="WINBOX-CORE2"
```

Tes: Winbox ke `144.79.228.137:1272` harus masuk CORE 2 (bukan timeout).

Kalau ISP sudah forward `1272` ke `172.127.2.2:8291` di modem, rule dstnat di CORE 2 justru bisa salah arah. Tes dulu; jika Winbox sudah masuk tanpa ubah NAT, **jangan** diubah.

### 2.4 Device Management di Fiberix

Di **Device** CORE 2:

| Field | Isi |
|---|---|
| IP | `144.79.228.137` (`CORE2_PUB`) |
| Port API | `8088` |
| Protocol | REST HTTP |
| User | user API yang sudah ada (bukan disalin ke chat) |

Simpan, tes **Terhubung**.

Jika gagal:

- Dari VPS Fiberix: `curl -I --max-time 5 http://144.79.228.137:8088/` — harus ada jawaban RouterOS, bukan timeout.
- Modem CORE 2 harus **port-forward TCP 8088** ke `172.127.2.2` jika public IP duduk di modem, bukan di CORE 2.
- UFW/ISP CORE 2 tidak memblokir 8088.

---

## 3. Sisi B — PPPoE auth Fiberix (UDP 1812/1813)

Auth: FreeRADIUS di `192.168.22.99:1812`.  
Accounting: Node billing di `192.168.22.99:1813`.  
MikroTik mengirim **keduanya** ke `address=` yang sama.

Dari CORE 2, tujuan RADIUS **bukan** `192.168.22.99` (itu private). Tujuan = **`FX_PUB`**.

### 3.1 DNAT di mesin yang pegang IP public Fiberix

SSH `103.195.65.216:2221` sudah sampai `192.168.22.99`, jadi 80/443/2221 sudah di-forward ke billing. UDP 1812/1813 **belum** tentu.

Cari di mana DNAT TCP 80/2221 dibuat (ACS `192.168.22.1`, modem, atau iptables di `22.99`). Tambahkan **UDP** di perangkat yang **sama**.

**Jika DNAT di MikroTik tepi (ACS / router public):**

```routeros
/ip firewall nat
add chain=dstnat protocol=udp dst-address=103.195.65.216 dst-port=1812 \
    action=dst-nat to-addresses=192.168.22.99 to-ports=1812 comment="FIBERIX-RADIUS-AUTH"
add chain=dstnat protocol=udp dst-address=103.195.65.216 dst-port=1813 \
    action=dst-nat to-addresses=192.168.22.99 to-ports=1813 comment="FIBERIX-RADIUS-ACCT"

/ip firewall filter
add chain=forward action=accept protocol=udp dst-address=192.168.22.99 \
    dst-port=1812,1813 src-address=144.79.228.137 comment="CORE2-RADIUS"
```

Ganti `dst-address` jika IP public tidak tertulis di router itu (kadang cukup `in-interface=WAN dst-port=1812`).

**Jika public IP sudah sampai ens18 `192.168.22.99` (1:1 / IP di VPS):** tidak perlu DNAT. Cukup UFW §3.2. Cek: `ip -4 addr` di billing harus kelihatan `103.195.65.216` **atau** NAT-nya di hop depan.

**Jika DNAT di Linux tepi / VPS (iptables):**

```bash
iptables -t nat -A PREROUTING -p udp -d 103.195.65.216 --dport 1812 -j DNAT --to-destination 192.168.22.99:1812
iptables -t nat -A PREROUTING -p udp -d 103.195.65.216 --dport 1813 -j DNAT --to-destination 192.168.22.99:1813
iptables -A FORWARD -p udp -s 144.79.228.137 -d 192.168.22.99 --dport 1812 -j ACCEPT
iptables -A FORWARD -p udp -s 144.79.228.137 -d 192.168.22.99 --dport 1813 -j ACCEPT
# simpan rule sesuai distro (iptables-persistent / aaPanel / nft)
```

Jangan buka 1812 dari `Anywhere`.

### 3.2 UFW di VPS billing (`192.168.22.99`)

```bash
sudo ufw allow proto udp from 144.79.228.137 to any port 1812 comment 'CORE2-RADIUS-AUTH'
sudo ufw allow proto udp from 144.79.228.137 to any port 1813 comment 'CORE2-RADIUS-ACCT'
sudo ufw status | grep 181
```

Rule lama `10.201.0.0/24` (WG) boleh **tetap** selama tunnel masih ada. Setelah cutover dan WG dimatikan, hapus rule 10.201.

Pastikan FreeRADIUS listen:

```bash
sudo ss -ulnp | grep 1812
# harus: 0.0.0.0:1812 freeradius
sudo ss -ulnp | grep 1813
# harus: 0.0.0.0:1813 node  (accounting Fiberix, bukan FreeRADIUS)
```

### 3.3 Tabel `nas` — nasname = IP public CORE 2

FreeRADIUS memutuskan client dari **IP sumber** paket. Tanpa WG, sumber = `CORE2_PUB` (`144.79.228.137`), bukan `10.201.0.2`.

Di MySQL `radius` (billing):

```sql
-- cek
SELECT id, nasname, shortname, CHAR_LENGTH(secret) AS secret_len FROM nas;

-- transisi: biarkan baris tunnel, tambah baris public (secret SAMA dengan Modul NAS CORE 2)
INSERT INTO nas (nasname, shortname, type, secret, description)
SELECT '144.79.228.137', 'CORE 2 public', 'mikrotik', secret, 'CORE 2 WAN public'
FROM nas WHERE nasname = '10.201.0.2' LIMIT 1;
```

Secret **harus identik** dengan `/radius` comment=FIBERIX di CORE 2. Jangan ketik secret di chat / tiket.

Setelah INSERT, restart FreeRADIUS supaya `read_clients` terbaca:

```bash
sudo systemctl restart freeradius
sudo systemctl is-active freeradius
```

Di Modul NAS Fiberix: `nasname` / IP NAS = `144.79.228.137`, mode LAN/public (bukan tunnel `10.201.0.2`).

### 3.4 `/radius` di CORE 2

Tujuan = **IP public Fiberix**, sumber = IP public CORE 2 (atau biarkan kosong jika routing WAN sudah benar).

```routeros
/ip firewall address-list
add list=FIBERIX-RADIUS address=103.195.65.216 comment="RADIUS Fiberix public"

/ip route
add dst-address=103.195.65.216/32 gateway=172.127.2.1 comment="FIBERIX-RADIUS-PUBLIC"

/radius
set [find comment="FIBERIX"] address=103.195.65.216 authentication-port=1812 \
    accounting-port=1813 src-address=144.79.228.137 timeout=3s \
    require-message-auth=no disabled=yes
```

`src-address=144.79.228.137` hanya jika IP itu **ada di CORE 2**. Kalau public IP hanya di modem (CORE 2 cuma `172.127.2.2`), **hapus src-address** — sumber yang dilihat Fiberix adalah IP public hasil NAT modem. `nasname` tetap IP yang **dilihat FreeRADIUS** (cek log FR).

BillingRadius **jangan** di-disable:

```routeros
/radius print
/ppp aaa print
```

Harus kelihatan: BILLINGRADIUS `172.20.1.1` **enabled**. FIBERIX `103.195.65.216` sementara **disabled**.

---

## 4. Tes (urutan wajib)

Kerjakan berurutan. Jika satu gagal, jangan lanjut pindah auth.

### 4.1 Manajemen

1. Dari PC kantor / VPS Fiberix: Winbox `CORE2_PUB:8291` atau `:1272`.
2. Device Management Fiberix: CORE 2 **Terhubung**.
3. `curl` dari `192.168.22.99` ke `http://CORE2_PUB:8088/` tidak timeout.

### 4.2 RADIUS jaringan

Dari CORE 2:

```routeros
/ping 103.195.65.216 count=5
```

Harus reply. (ICMP saja; 1812 bisa tetap diblokir.)

Dari VPS Fiberix, selama tes, lihat paket:

```bash
sudo tcpdump -n -i any udp port 1812
```

Lalu di CORE 2 **enable** FIBERIX **tanpa** mematikan BillingRadius, geser FIBERIX ke **urutan 1**. Suruh **1 user tes** reconnect (user yang ada di `radcheck` Fiberix).

- `tcpdump` kelihatan paket dari `144.79.228.137` → `22.99:1812`
- `journalctl -u freeradius -n 50` : Access-Accept, bukan Ignore unknown client
- User tes online

Kalau **timeout** (tidak ada paket di tcpdump): DNAT/UFW/routing belum beres — **kembalikan urutan**: BillingRadius ke atas, disable FIBERIX.

Kalau **Reject**: secret / user `radcheck` tidak cocok — jangan matikan BillingRadius; 160 sesi lain masih aman selama BillingRadius enabled di urutan 2 **hanya jika** server pertama timeout. **Reject tidak failover.** Jadi uji 1 user dulu saat sepi.

### 4.3 Cutover

Hanya jika 4.1 dan 4.2 Accept:

```routeros
/radius disable [find comment="BILLINGRADIUS"]
```

Pantau 15 menit: login baru, disconnect, isolir. Siapkan:

```routeros
/radius enable [find comment="BILLINGRADIUS"]
/radius move [find comment="BILLINGRADIUS"] 0
```

### 4.4 Matikan WG (terakhir)

Hanya setelah Device + RADIUS public stabil **beberapa hari**:

```routeros
/interface wireguard disable wg-neva
```

Jangan hapus dulu. Kalau public IP gagal, enable lagi `wg-neva`.

Hub VPS NevaCloud baru boleh tidak diperpanjang setelah langkah ini sadar dan rollback WG tidak lagi dibutuhkan.

---

## 5. Yang tidak boleh

- Buka `8291` / `8088` / `1812` dari `Anywhere` di UFW, modem, atau `/ip service`.
- Ganti `nasname` ke public IP **tanpa** baris `nas` + restart FreeRADIUS.
- Isi `/radius address=192.168.22.99` dari CORE 2 tanpa tunnel — itu IP private, akan timeout.
- Matikan BillingRadius sebelum 1 user Fiberix **Accept**.
- Mengandalkan `require-message-auth=yes` ke FreeRADIUS lama (CORE 2 sudah `no` untuk FIBERIX).
- Menghapus `wg-neva` di hari yang sama dengan cutover.

## 6. Rollback cepat

```routeros
/radius enable [find comment="BILLINGRADIUS"]
/radius move [find comment="BILLINGRADIUS"] 0
/radius disable [find comment="FIBERIX"]
/interface wireguard enable wg-neva
```

PPPoE kembali ke `172.20.1.1`. Device Management kembali ke `10.201.0.2` jika tunnel hidup.

## 7. Ringkas keputusan

| Kebutuhan | Public static CORE 2 | Masih perlu WG? |
|---|---|---|
| User internet (BillingRadius) | Tidak | Tidak |
| Fiberix lihat CORE 2 | Ya + forward 8088 + filter IP kantor | Tidak, jika §2 lulus |
| Auth Fiberix | Ya **plus** DNAT 1812 di **FX_PUB** + `nasname` public | Tidak, jika §3–4 lulus |
| Tidak sewa DNAT 1812 di kantor | — | **Ya**, WG tetap wajib |
