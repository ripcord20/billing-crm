package id.fiberix.zteshell;

import android.content.Context;

import org.json.JSONArray;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

public class ScriptStore {
    private static final String PREF = "zte_ssh_scripts_enc";
    private final SecurePrefs prefs;

    public ScriptStore(Context ctx) {
        prefs = new SecurePrefs(ctx, PREF);
        if (all().isEmpty()) seedBuiltins();
    }

    public List<SavedScript> all() {
        List<SavedScript> out = new ArrayList<>();
        try {
            JSONArray arr = new JSONArray(prefs.load());
            for (int i = 0; i < arr.length(); i++) {
                out.add(SavedScript.fromJson(arr.getJSONObject(i)));
            }
        } catch (Exception ignored) {
        }
        return out;
    }

    public SavedScript find(String id) {
        if (id == null) return null;
        for (SavedScript s : all()) {
            if (id.equals(s.id)) return s;
        }
        return null;
    }

    public void save(SavedScript s) {
        List<SavedScript> list = all();
        if (s.id == null || s.id.isEmpty()) s.id = UUID.randomUUID().toString();
        boolean replaced = false;
        for (int i = 0; i < list.size(); i++) {
            if (s.id.equals(list.get(i).id)) {
                list.set(i, s);
                replaced = true;
                break;
            }
        }
        if (!replaced) list.add(0, s);
        persist(list);
    }

    public void delete(String id) {
        List<SavedScript> keep = new ArrayList<>();
        for (SavedScript s : all()) {
            if (!id.equals(s.id)) keep.add(s);
        }
        persist(keep);
    }

    public void restoreExamples() {
        List<SavedScript> list = all();
        for (SavedScript b : ScriptCatalog.builtins()) {
            boolean found = false;
            for (SavedScript s : list) {
                if (b.id.equals(s.id)) {
                    found = true;
                    break;
                }
            }
            if (!found) list.add(b);
        }
        persist(list);
    }

    private void seedBuiltins() {
        persist(new ArrayList<>(ScriptCatalog.builtins()));
    }

    private void persist(List<SavedScript> list) {
        JSONArray arr = new JSONArray();
        try {
            for (SavedScript s : list) arr.put(s.toJson());
        } catch (Exception ignored) {
        }
        prefs.save(arr.toString());
    }
}
