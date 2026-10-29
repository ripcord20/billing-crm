package id.fiberix.zteshell;

import org.json.JSONException;
import org.json.JSONObject;

public class SavedScript {
    public String id;
    public String name;
    public String note;
    public String body;
    public boolean builtin;

    public JSONObject toJson() throws JSONException {
        JSONObject o = new JSONObject();
        o.put("id", id);
        o.put("name", name);
        o.put("note", note);
        o.put("body", body);
        o.put("builtin", builtin);
        return o;
    }

    public static SavedScript fromJson(JSONObject o) {
        SavedScript s = new SavedScript();
        s.id = o.optString("id");
        s.name = o.optString("name");
        s.note = o.optString("note");
        s.body = o.optString("body");
        s.builtin = o.optBoolean("builtin", false);
        return s;
    }

    public int lineCount() {
        return ScriptVars.lineCount(body);
    }

    public String label() {
        String n = name == null || name.trim().isEmpty() ? "(tanpa nama)" : name.trim();
        String tag = builtin ? "contoh · " : "";
        return n + "  ·  " + tag + lineCount() + " baris";
    }
}
