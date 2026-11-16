package id.fiberix.zteshell;

import org.json.JSONException;
import org.json.JSONObject;

public class OltProfile {
    public String id;
    public String name;
    public String host;
    public int port;
    public String username;
    public String password;
    public String enablePassword;
    public boolean ssh;

    public OltProfile() {
        this.ssh = true;
        this.port = 22;
    }

    public JSONObject toJson() throws JSONException {
        JSONObject o = new JSONObject();
        o.put("id", id);
        o.put("name", name);
        o.put("host", host);
        o.put("port", port);
        o.put("username", username);
        o.put("password", password);
        o.put("enablePassword", enablePassword);
        o.put("ssh", ssh);
        return o;
    }

    public static OltProfile fromJson(JSONObject o) {
        OltProfile p = new OltProfile();
        p.id = o.optString("id");
        p.name = o.optString("name");
        p.host = o.optString("host");
        p.port = o.optInt("port", 22);
        p.username = o.optString("username");
        p.password = o.optString("password");
        p.enablePassword = o.optString("enablePassword");
        p.ssh = o.optBoolean("ssh", true);
        return p;
    }

    public String label() {
        String n = name == null || name.trim().isEmpty() ? host : name.trim();
        return n + "  ·  " + (ssh ? "SSH" : "Telnet") + " " + host + ":" + port;
    }
}
