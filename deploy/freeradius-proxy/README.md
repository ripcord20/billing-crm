# FreeRADIUS sebagai pintu tunggal (proxy ke BillingRadius)

Tujuan: CORE 1/2 hanya punya **satu** `/radius` → FreeRADIUS Fiberix.
User baru (ada di `radcheck`) di-Accept lokal. User lama BillingRadius
di-proxy ke `172.20.1.1`.

Jangan ubah urutan `/radius` di CORE sebelum langkah 4 lulus.
Jangan pin `src-address` pada entri BillingRadius.
Jangan ganti IP interface CORE.

## 1. Host FreeRADIUS (bukan box Fiberix Node)

Biasanya `192.168.22.9` (daloRADIUS). Salin file ini ke server itu.

```
/etc/freeradius/3.0/proxy.conf          ← gabungkan proxy.conf
/etc/freeradius/3.0/policy.d/fiberix-proxy  ← file ini
```

Di `sites-enabled/default` dan `sites-enabled/inner-tunnel`, pada
`authorize`, **setelah** modul `sql`:

```
sql
fiberix_proxy_notfound
```

Isi `secret` di `proxy.conf` dengan secret NAS yang sama dengan
`/radius` BillingRadius di CORE (bukan password MySQL).

## 2. clients / nas

Tabel `nas` harus berisi IP yang dipakai CORE saat mengirim RADIUS
(identity CORE 1: `192.168.91.1`; jalur ke ACS: `192.168.17.1`;
CORE 2; GANANET). Reload FreeRADIUS setelah mengubah `nas`.

## 3. Tes dari host FreeRADIUS (sebelum sentuh CORE)

```
radtest <user-fiberix> <password> 127.0.0.1 0 <nas-secret>
radtest <user-billingradius> <password> 127.0.0.1 0 <nas-secret>
```

Keduanya harus Access-Accept. Kalau user BillingRadius Reject,
proxy belum jalan — **jangan** pindah CORE.

## 4. Baru di CORE

1. Pastikan `/ppp aaa use-radius=yes`.
2. Ganti `/radius` menjadi **satu** baris: address FreeRADIUS,
   `src-address=192.168.91.1` hanya untuk entri Fiberix di CORE 1.
3. Biarkan BillingRadius di CORE sampai langkah 3 lulus.
4. Setelah semua user 10.2.x ada di Fiberix, proxy boleh dimatikan.
