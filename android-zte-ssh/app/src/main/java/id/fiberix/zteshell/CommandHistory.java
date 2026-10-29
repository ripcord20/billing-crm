package id.fiberix.zteshell;

import java.util.ArrayList;
import java.util.List;

/** Riwayat perintah terminal: panah atas = sebelumnya, panah bawah = berikutnya. */
public class CommandHistory {
    static final int MAX = 80;

    private final List<String> items = new ArrayList<>();
    private String draft = "";
    private int pos;

    public void add(String line) {
        if (line == null) return;
        String t = line.trim();
        if (t.isEmpty()) return;
        if (items.isEmpty() || !items.get(items.size() - 1).equals(t)) {
            items.add(t);
            if (items.size() > MAX) items.remove(0);
        }
        pos = items.size();
        draft = "";
    }

    public boolean isEmpty() {
        return items.isEmpty();
    }

    /** @return perintah sebelumnya, atau null jika riwayat kosong */
    public String up(String currentBox) {
        if (items.isEmpty()) return null;
        if (pos >= items.size()) {
            draft = currentBox == null ? "" : currentBox;
            pos = items.size();
        }
        if (pos > 0) pos--;
        return items.get(pos);
    }

    /** @return perintah berikutnya, atau draf kotak saat mulai panah atas */
    public String down() {
        if (items.isEmpty()) return null;
        if (pos < items.size() - 1) {
            pos++;
            return items.get(pos);
        }
        pos = items.size();
        return draft;
    }
}
