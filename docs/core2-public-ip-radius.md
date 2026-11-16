# Panduan: CORE 2 pakai IP public static (tanpa WireGuard)

Tujuan: Fiberix kelola CORE 2 dan auth PPPoE Fiberix **tanpa** VPS hub WireGuard (`103.169.206.24` / `10.201.0.x`).

## Jawaban singkat: apakah FreeRADIUS harus punya IP public static?

**Hampir benar, dengan satu pembeda:**

| Yang dimaksud | Wajib public static? | Keterangan |
|---|---|---|
| Proses FreeRADIUS | **Tidak** | Tetap di LAN billing `192.168.22.99:1812` |
| Alamat yang diisi CORE 2 di `/radius address=` | **Ya** | Tanpa WG, CORE 2 tidak bisa kirim UDP ke `192.168.22.99` |
| IP public baru khusus FreeRADIUS | **Tidak wajib** | Cukup pakai IP public Fiberix yang sudah ada (`FX_PUB`, sekarang `103.195.65.216`) + **DNAT UDP 1812/1813** ke `22.99` |

Jadi: FreeRADIUS **tidak** perlu pindah ke internet / tidak perlu NIC public sendiri. Yang wajib “kelihatan di internet” adalah **pintu** ke FreeRADIUS — IP public kantor/VPS Fiberix — karena CORE 2 menembak alamat itu.

Kalau `FX_PUB` tidak bisa menerima UDP 1812 (ISP blokir, hosting larang, atau IP tidak static), baru perlu IP public static **lain** untuk RADIUS, atau tetap pakai WireGuard.

Sesi PPPoE yang sudah online lewat BillingRadius **jangan dipindah** sebelum tes 1 user sukses. Jangan buka `0.0.0.0/0`.

## Jangan pakai `144.79.228.137` untuk interconnect

`144.79.228.137` **hanya** jalur remote Winbox dari ISP (port `1272`). **Bukan** IP WAN CORE 2, **bukan** `nasname`, **bukan** `src-address` RADIUS, **bukan** IP Device Management Fiberix.

Jangan isi IP itu di:

- Modul NAS / tabel `nas.nasname`
- `/radius` CORE 2 (`address=` atau `src-address=`)
- UFW / iptables “from CORE 2”
- Device Management (REST `8088`)

Winbox lewat ISP ke `144.79.228.137:1272` boleh tetap untuk admin manusia. Fiberix ↔ CORE 2 tanpa WG memakai **`41.216.191.123`** (Perwiramedia). **Jangan** 1:1 NAT IP itu ke `192.168.22.9` — `22.9` adalah mesin daloRADIUS lama di LAN Fiberix, bukan CORE 2.

## 0. Inventaris

| Peran | Nilai | Wajib static? |
|---|---|---|
| CORE 2 WAN lokal | `172.127.2.2/30` (vlan1272) | — |
| CORE 2 IP public interconnect | **`41.216.191.123`** (Perwiramedia, bukan `144.79.228.137`) | **Ya** |
| Jalur Winbox ISP saja | `144.79.228.137:1272` | Jangan dipakai RADIUS/API |
| CORE 2 REST / Winbox lokal / API | TCP `8088` / `8291` / `8872` | — |
| Billing Fiberix LAN | `192.168.22.99` | — |
| Billing Fiberix public (`FX_PUB`) | `103.195.65.216` (SSH 2221, HTTP 80/443 sudah ke `22.99`) | **Ya** — ini pintu RADIUS |
| FreeRADIUS (proses) | `192.168.22.99` UDP **1812** | Private, di belakang DNAT |
| Accounting Node | `192.168.22.99` UDP **1813** | Private, di belakang DNAT |
| Auth PPPoE hari ini | BillingRadius `172.20.1.1` (L2TP) | Jangan dimatikan dulu |
| NAS Fiberix sekarang | `nasname=10.201.0.2` (tunnel WG) | Nanti = `41.216.191.123` |

Dua IP interconnect yang **tidak boleh berubah**:

1. `41.216.191.123` = IP public static **WAN CORE 2** (Perwiramedia; terpisah dari Winbox ISP)
2. `FX_PUB` = `103.195.65.216` (kantor/VPS Fiberix) — pintu ke FreeRADIUS

### Jangan NAT `41.216.191.123` ke `192.168.22.9`

Itu dua sisi berbeda:

| Sisi | IP | Fungsi |
|---|---|---|
| CORE 2 (Perwiramedia) | `41.216.191.123` | Identitas WAN / `nasname` / sumber paket RADIUS |
| Billing Fiberix | `192.168.22.99` | FreeRADIUS + web Fiberix. **Ini** tujuan DNAT 1812 |
| daloRADIUS lama | `192.168.22.9` | Mesin lain di LAN kantor. Bukan CORE 2, bukan tujuan NAT IP Perwiramedia |

Kalau IP public Perwiramedia belum duduk di MikroTik CORE 2, 1:1 NAT-nya ke **IP WAN CORE 2** (mis. `172.127.2.2`), bukan ke `192.168.22.9`.

Dari CORE 2, `/radius address=` = **`103.195.65.216`**, bukan `192.168.22.9` dan bukan `192.168.22.99` (keduanya LAN, tidak tembus dari internet).

Cek IP mana yang benar-benar milik CORE 2:

```routeros
/ip address print
/ip cloud print
/ip route print where dst-address=0.0.0.0/0
```

`41.216.191.123` harus kelihatan sebagai alamat WAN CORE 2 **atau** hasil 1:1 NAT modem Perwiramedia ke IP LAN CORE 2. Bukan IP helper Winbox ISP, bukan `192.168.22.9`.

## 1. Gambar jalur (tanpa WG)

```
Pelanggan PPPoE
      |
   CORE 2  (WAN = 41.216.191.123 Perwiramedia, bukan 144.79.228.137)
      |  UDP 1812/1813  ----->  FX_PUB 103.195.65.216  --DNAT-->  192.168.22.99:1812/1813
      |                                                    FreeRADIUS Fiberix (bukan 22.9)
      |
Fiberix Device Management
   192.168.22.99  --TCP 8088-->  41.216.191.123
```

Dua sisi **saling kebalikan**. Satu sisi saja = timeout / “Belum terhubung”.

FreeRADIUS tetap di `22.99`. Yang public adalah `FX_PUB`.

---

## 2. Sisi A — Fiberix kelola CORE 2 (API)

Firewall di CORE 2: hanya dari `FX_PUB`, bukan dari seluruh internet, bukan dari `144.79.228.137`.

```routeros
/ip firewall address-list
add list=FIBERIX-MGMT address=103.195.65.216 comment="kantor/VPS Fiberix"

/ip firewall filter
add chain=input action=accept protocol=tcp dst-port=8088,8291,8872 \
    src-address-list=FIBERIX-MGMT comment="FIBERIX-MGMT" place-before=0
add chain=input action=drop protocol=tcp dst-port=8291,8088,8872 \
    comment="drop winbox/api selain Fiberix"
```

Kalau admin manusia masih Winbox lewat ISP `144.79.228.137:1272`, itu jalur **terpisah** di sisi ISP — jangan campur dengan rule Device Management.

```routeros
/ip service
set www port=8088 disabled=no
set winbox port=8291 disabled=no
```

Device Management Fiberix:

| Field | Isi |
|---|---|
| IP | `41.216.191.123` (bukan `144.79.228.137`) |
| Port API | `8088` |
| Protocol | REST HTTP |

Tes dari VPS Fiberix:

```bash
curl -I --max-time 5 http://41.216.191.123:8088/
```

Kalau public IP duduk di modem, modem forward TCP `8088` ke `172.127.2.2`.

---

## 3. Sisi B — PPPoE auth (UDP 1812/1813)

Dari CORE 2, `/radius address=` = **`FX_PUB`** (`103.195.65.216`), bukan `192.168.22.9`, bukan `192.168.22.99`, bukan `144.79.228.137`.

Proses tetap:

- Auth: FreeRADIUS `192.168.22.99:1812`
- Acct: Node `192.168.22.99:1813`

### 3.1 DNAT di mesin yang pegang `FX_PUB`

SSH `103.195.65.216:2221` sudah sampai `22.99` (TCP 80/443/2221). UDP 1812/1813 **belum** tentu. Tambahkan UDP di perangkat **yang sama** dengan DNAT TCP itu.

**MikroTik tepi:**

```routeros
/ip firewall nat
add chain=dstnat protocol=udp dst-address=103.195.65.216 dst-port=1812 \
    action=dst-nat to-addresses=192.168.22.99 to-ports=1812 comment="FIBERIX-RADIUS-AUTH"
add chain=dstnat protocol=udp dst-address=103.195.65.216 dst-port=1813 \
    action=dst-nat to-addresses=192.168.22.99 to-ports=1813 comment="FIBERIX-RADIUS-ACCT"

/ip firewall filter
add chain=forward action=accept protocol=udp dst-address=192.168.22.99 \
    dst-port=1812,1813 src-address=41.216.191.123 comment="CORE2-RADIUS"
```

`CORE2_PUB` = `41.216.191.123`. **Jangan** `144.79.228.137`. DNAT tujuan = **`192.168.22.99`**, bukan `192.168.22.9`.

**Jika `ip -4 addr` di billing sudah kelihatan `103.195.65.216`:** tidak perlu DNAT, cukup UFW.

**iptables di Linux tepi:**

```bash
iptables -t nat -A PREROUTING -p udp -d 103.195.65.216 --dport 1812 -j DNAT --to-destination 192.168.22.99:1812
iptables -t nat -A PREROUTING -p udp -d 103.195.65.216 --dport 1813 -j DNAT --to-destination 192.168.22.99:1813
iptables -A FORWARD -p udp -s 41.216.191.123 -d 192.168.22.99 --dport 1812 -j ACCEPT
iptables -A FORWARD -p udp -s 41.216.191.123 -d 192.168.22.99 --dport 1813 -j ACCEPT
```

Jangan buka 1812 dari `Anywhere`.

### 3.2 UFW di VPS billing

```bash
sudo ufw allow proto udp from 41.216.191.123 to any port 1812 comment 'CORE2-PERWIRA-RADIUS-AUTH'
sudo ufw allow proto udp from 41.216.191.123 to any port 1813 comment 'CORE2-PERWIRA-RADIUS-ACCT'
sudo ufw status | grep 181
sudo ss -ulnp | grep -E '1812|1813'
```

Harus: `0.0.0.0:1812` = freeradius, `0.0.0.0:1813` = node. Rule `10.201.0.0/24` boleh tetap selama WG masih ada.

### 3.3 Tabel `nas` — nasname = `41.216.191.123`

FreeRADIUS melihat **IP sumber** paket UDP. Tanpa WG itu = WAN public CORE 2 (`41.216.191.123`), bukan `10.201.0.2`, bukan `144.79.228.137`, bukan `192.168.22.9`.

```sql
SELECT id, nasname, shortname, CHAR_LENGTH(secret) AS secret_len FROM nas;

INSERT INTO nas (nasname, shortname, type, secret, description)
SELECT '41.216.191.123', 'CORE 2 public', 'mikrotik', secret, 'CORE 2 WAN Perwiramedia'
FROM nas WHERE nasname = '10.201.0.2' LIMIT 1;
```

Secret **harus sama** dengan `/radius` comment=FIBERIX. Jangan ketik secret di chat.

```bash
sudo systemctl restart freeradius
```

Modul NAS Fiberix: metode **IP Publik**, IP NAS = `41.216.191.123`.

### 3.4 `/radius` di CORE 2

```routeros
/ip route
add dst-address=103.195.65.216/32 gateway=172.127.2.1 comment="FIBERIX-RADIUS-PUBLIC"

/radius
set [find comment="FIBERIX"] address=103.195.65.216 authentication-port=1812 \
    accounting-port=1813 src-address=41.216.191.123 timeout=3s \
    require-message-auth=no disabled=yes
```

`src-address=41.216.191.123` hanya jika IP itu **ada di CORE 2**. Kalau public 1:1 di modem Perwiramedia ke IP LAN CORE 2, **kosongkan src-address**. `nasname` = IP yang **dilihat** FreeRADIUS di `tcpdump` (bukan IP Winbox ISP, bukan `192.168.22.9`).

BillingRadius **tetap enabled**:

```routeros
/radius print
/ppp aaa print
```

---

## 4. Tes

1. Device Management ke `41.216.191.123:8088` Terhubung (bukan ke `144.79.228.137`).
2. Dari CORE 2: `/ping 103.195.65.216 count=5`.
3. Di VPS: `sudo tcpdump -n -i any udp port 1812`.
4. Enable FIBERIX, **jangan** matikan BillingRadius, geser FIBERIX urutan 1, tes **1 user**.
5. Paket harus dari `41.216.191.123` → `22.99:1812`. Accept. Baru boleh disable BillingRadius.
6. WG dimatikan terakhir, setelah stabil beberapa hari.

Reject **tidak** failover ke BillingRadius. Timeout baru failover.

## 5. Yang tidak boleh

- Memakai `144.79.228.137` sebagai `nasname`, `src-address` RADIUS, atau IP Device Management.
- Menyewa IP public di CORE 2 tanpa DNAT 1812 di `FX_PUB` — auth Fiberix tetap timeout.
- Memindahkan daemon FreeRADIUS ke internet hanya karena CORE 2 public; DNAT cukup.
- Buka `8291` / `8088` / `1812` dari `Anywhere`.
- `/radius address=192.168.22.99` tanpa tunnel.
- Matikan BillingRadius sebelum 1 user **Accept**.

## 6. Rollback

```routeros
/radius enable [find comment="BILLINGRADIUS"]
/radius move [find comment="BILLINGRADIUS"] 0
/radius disable [find comment="FIBERIX"]
/interface wireguard enable wg-neva
```

## 7. Ringkas

| Kebutuhan | Perlu public static di mana? |
|---|---|
| User internet (BillingRadius) | Tidak |
| Fiberix lihat CORE 2 | `41.216.191.123:8088` (bukan IP Winbox ISP, bukan `22.9`) |
| Auth PPPoE Fiberix | `FX_PUB` + DNAT 1812 ke **`192.168.22.99`** (bukan ke `22.9`); FreeRADIUS tetap LAN |
| Sewa IP public **kedua** khusus FreeRADIUS | Hanya jika `103.195.65.216` tidak bisa terima UDP 1812 |
| Tidak bisa DNAT 1812 di kantor | WireGuard tetap wajib |
