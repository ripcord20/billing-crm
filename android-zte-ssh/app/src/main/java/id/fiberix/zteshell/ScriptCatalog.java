package id.fiberix.zteshell;

import java.util.ArrayList;
import java.util.List;

/** Contoh skrip C300 — teknisi menyalin lalu menyesuaikan. */
final class ScriptCatalog {
    private ScriptCatalog() {}

    static List<SavedScript> builtins() {
        List<SavedScript> out = new ArrayList<>();
        out.add(ex("builtin-uncfg",
                "Lihat ONU belum register",
                "Cek SN yang menunggu di OLT. Tidak mengubah konfigurasi.",
                "show gpon onu uncfg"));
        out.add(ex("builtin-state",
                "Cek state ONU di PON",
                "Ganti {PON} = nomor port (contoh 1). Isi saat mengambil skrip.",
                "show gpon onu state gpon-olt_1/1/{PON}"));
        out.add(ex("builtin-reg-ont",
                "Register ONT + service internet",
                "Contoh C300. Isi {PON} {ONU} {TYPE} {SN} {NAMA} {VLAN} saat ambil. Sesuaikan profile tcont/gemport di OLT Anda sebelum Kirim.",
                "configure terminal\n"
                        + "interface gpon-olt_1/1/{PON}\n"
                        + "onu {ONU} type {TYPE} sn {SN}\n"
                        + "exit\n"
                        + "pon-onu-mng gpon-onu_1/1/{PON}:{ONU}\n"
                        + "name {NAMA}\n"
                        + "tcont 1 name internet profile 1G\n"
                        + "gemport 1 name internet tcont 1\n"
                        + "service-port 1 vport 1 user-vlan {VLAN} vlan {VLAN}\n"
                        + "exit\n"
                        + "exit\n"
                        + "write"));
        out.add(ex("builtin-del-ont",
                "Hapus ONU dari PON",
                "Hati-hati: menghapus ONU. Isi {PON} dan {ONU}. Pastikan sudah benar sebelum Kirim.",
                "configure terminal\n"
                        + "interface gpon-olt_1/1/{PON}\n"
                        + "no onu {ONU}\n"
                        + "exit\n"
                        + "exit\n"
                        + "write"));
        out.add(ex("builtin-health",
                "Cek kartu & suhu OLT",
                "Perintah baca saja. Aman dikirim kapan saja.",
                "terminal length 0\nshow card\nshow processor\nshow temperature"));
        return out;
    }

    private static SavedScript ex(String id, String name, String note, String body) {
        SavedScript s = new SavedScript();
        s.id = id;
        s.name = name;
        s.note = note;
        s.body = body;
        s.builtin = true;
        return s;
    }
}
