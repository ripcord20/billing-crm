package id.fiberix.zteshell;

import android.content.Context;

import org.json.JSONArray;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

public class ProfileStore {
    private final SecurePrefs prefs;

    public ProfileStore(Context ctx) {
        prefs = new SecurePrefs(ctx);
    }

    public List<OltProfile> all() {
        List<OltProfile> out = new ArrayList<>();
        try {
            JSONArray arr = new JSONArray(prefs.load());
            for (int i = 0; i < arr.length(); i++) {
                out.add(OltProfile.fromJson(arr.getJSONObject(i)));
            }
        } catch (Exception ignored) {
        }
        return out;
    }

    public void save(OltProfile p) {
        List<OltProfile> list = all();
        if (p.id == null || p.id.isEmpty()) p.id = UUID.randomUUID().toString();
        boolean replaced = false;
        for (int i = 0; i < list.size(); i++) {
            if (p.id.equals(list.get(i).id)) {
                list.set(i, p);
                replaced = true;
                break;
            }
        }
        if (!replaced) list.add(0, p);
        persist(list);
    }

    public void delete(String id) {
        List<OltProfile> list = all();
        List<OltProfile> keep = new ArrayList<>();
        for (OltProfile p : list) {
            if (!id.equals(p.id)) keep.add(p);
        }
        persist(keep);
    }

    public OltProfile find(String id) {
        for (OltProfile p : all()) {
            if (id.equals(p.id)) return p;
        }
        return null;
    }

    private void persist(List<OltProfile> list) {
        JSONArray arr = new JSONArray();
        try {
            for (OltProfile p : list) arr.put(p.toJson());
        } catch (Exception ignored) {
        }
        prefs.save(arr.toString());
    }
}
