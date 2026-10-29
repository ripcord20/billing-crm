package id.fiberix.zteshell;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Parser command tree ZTE C300 untuk highlight + suggestion.
 * Mode hanya berubah dari baris yang sudah dikirim, bukan saat mengetik.
 * Setelah login APK (enable), mode awal = privileged (ZXAN#).
 */
public final class ZteCliParser {
    public static final String PRIV = "privileged";
    public static final String CONFIG = "config";
    private static final Object FREE = new Object();

    private static final Map<String, Object> PRIV_TREE = buildPriv();
    private static final Map<String, Object> CONFIG_TREE = buildConfig();

    private ZteCliParser() {}

    public static final class Span {
        public final int start;
        public final int end;

        Span(int start, int end) {
            this.start = start;
            this.end = end;
        }
    }

    public static final class Result {
        public final List<Span> errors = new ArrayList<>();
        public final List<String> suggestions = new ArrayList<>();
    }

    public static Result parse(String mode, String text) {
        Result r = new Result();
        Object node = root(mode);
        if (text == null || text.isEmpty()) {
            addKeys(r.suggestions, node);
            return r;
        }
        boolean trailingSpace = Character.isWhitespace(text.charAt(text.length() - 1));
        List<Tok> toks = tokenize(text);
        if (toks.isEmpty()) {
            addKeys(r.suggestions, node);
            return r;
        }
        boolean broken = false;
        for (int i = 0; i < toks.size(); i++) {
            Tok t = toks.get(i);
            boolean last = i == toks.size() - 1;
            boolean complete = !last || trailingSpace;
            if (broken) {
                if (complete) r.errors.add(new Span(t.start, t.end));
                continue;
            }
            if (node == FREE) continue;

            Hit hit = hit(node, t.text);
            if (complete) {
                if (hit.matched) {
                    node = hit.next;
                } else {
                    r.errors.add(new Span(t.start, t.end));
                    broken = true;
                }
            } else if (hit.matched && hit.prefixMatches.size() == 1) {
                addKeys(r.suggestions, hit.next);
            } else {
                r.suggestions.addAll(hit.prefixMatches);
            }
        }
        if (trailingSpace && !broken) addKeys(r.suggestions, node);
        return r;
    }

    public static String modeAfter(String mode, String line) {
        String t = collapse(line);
        if (t.isEmpty()) return mode == null ? PRIV : mode;
        boolean config = CONFIG.equals(mode);
        if (config) {
            if (t.equals("exit") || t.equals("end")) return PRIV;
            return CONFIG;
        }
        if (t.equals("configure terminal") || t.equals("config terminal")
                || t.equals("conf t") || t.equals("config t")) {
            return CONFIG;
        }
        return PRIV;
    }

    public static String applySuggestion(String text, String suggestion) {
        if (suggestion == null || suggestion.isEmpty()) return text == null ? "" : text;
        if (text == null || text.isEmpty() || Character.isWhitespace(text.charAt(text.length() - 1))) {
            return (text == null ? "" : text) + suggestion + " ";
        }
        int i = text.length() - 1;
        while (i >= 0 && !Character.isWhitespace(text.charAt(i))) i--;
        String last = text.substring(i + 1);
        String head = text.substring(0, i + 1);
        String sl = suggestion.toLowerCase(Locale.US);
        String ll = last.toLowerCase(Locale.US);
        if (sl.startsWith(ll) || ll.startsWith(sl)) return head + suggestion + " ";
        return text + " " + suggestion + " ";
    }

    static Object root(String mode) {
        return CONFIG.equals(mode) ? CONFIG_TREE : PRIV_TREE;
    }

    private static String collapse(String line) {
        if (line == null) return "";
        return line.trim().replaceAll("\\s+", " ").toLowerCase(Locale.US);
    }

    private static List<Tok> tokenize(String text) {
        List<Tok> out = new ArrayList<>();
        int i = 0;
        int n = text.length();
        while (i < n) {
            while (i < n && Character.isWhitespace(text.charAt(i))) i++;
            if (i >= n) break;
            int s = i;
            while (i < n && !Character.isWhitespace(text.charAt(i))) i++;
            out.add(new Tok(text.substring(s, i), s, i));
        }
        return out;
    }

    private static Hit hit(Object node, String raw) {
        Hit h = new Hit();
        String token = raw.toLowerCase(Locale.US);
        if (node instanceof Map) {
            @SuppressWarnings("unchecked")
            Map<String, Object> map = (Map<String, Object>) node;
            for (Map.Entry<String, Object> e : map.entrySet()) {
                String key = e.getKey();
                if (key.endsWith("_") && token.startsWith(key)) {
                    h.matched = true;
                    h.next = unwrap(e.getValue());
                    if (!h.prefixMatches.contains(key)) h.prefixMatches.add(key);
                } else if (key.startsWith(token)) {
                    if (!h.prefixMatches.contains(key)) h.prefixMatches.add(key);
                    if (key.equals(token)) {
                        h.matched = true;
                        h.next = unwrap(e.getValue());
                    }
                }
            }
        } else if (node instanceof List) {
            @SuppressWarnings("unchecked")
            List<String> list = (List<String>) node;
            for (String key : list) {
                if (key.startsWith(token)) {
                    h.prefixMatches.add(key);
                    if (key.equals(token)) {
                        h.matched = true;
                        h.next = FREE;
                    }
                }
            }
        }
        return h;
    }

    private static Object unwrap(Object v) {
        return v == null ? FREE : v;
    }

    private static void addKeys(List<String> dest, Object node) {
        if (node == null || node == FREE) return;
        if (node instanceof Map) {
            @SuppressWarnings("unchecked")
            Map<String, Object> map = (Map<String, Object>) node;
            dest.addAll(map.keySet());
        } else if (node instanceof List) {
            @SuppressWarnings("unchecked")
            List<String> list = (List<String>) node;
            dest.addAll(list);
        }
    }

    private static Map<String, Object> map(Object... kv) {
        Map<String, Object> m = new LinkedHashMap<>();
        for (int i = 0; i + 1 < kv.length; i += 2) m.put((String) kv[i], kv[i + 1]);
        return m;
    }

    private static List<String> list(String... xs) {
        List<String> l = new ArrayList<>();
        Collections.addAll(l, xs);
        return l;
    }

    private static Map<String, Object> buildPriv() {
        return map(
                "enable", null,
                "disable", null,
                "configure", map("terminal", null),
                "config", map("terminal", null, "t", null),
                "conf", map("t", null),
                "show", map(
                        "gpon", map(
                                "onu", map(
                                        "state", null,
                                        "uncfg", null,
                                        "unconfig", null,
                                        "profile", null,
                                        "base-info", null,
                                        "detail-info", null,
                                        "by", list("sn")
                                ),
                                "olt", map("state", null, "traffic", null)
                        ),
                        "card", null,
                        "version", null,
                        "processor", null,
                        "temperature", null,
                        "running-config", null,
                        "vlan", map("summary", null, "database", null),
                        "mac", null,
                        "onu-type", map("gpon", null)
                ),
                "ping", null,
                "clear", null,
                "terminal", map("length", null),
                "write", list("memory"),
                "exit", null,
                "end", null
        );
    }

    private static Map<String, Object> buildConfig() {
        return map(
                "interface", map(
                        "gpon-olt_", null,
                        "gpon-onu_", null,
                        "gei_", null,
                        "xgei_", null,
                        "vlan", null
                ),
                "vlan", list("database", "smart", "translation"),
                "gpon", map(
                        "onu-type", null,
                        "profile", list("tcont", "traffic", "gemport")
                ),
                "onu", null,
                "no", map("interface", null, "vlan", null, "onu", null),
                "write", list("memory"),
                "exit", null,
                "end", null
        );
    }

    private static final class Tok {
        final String text;
        final int start;
        final int end;

        Tok(String text, int start, int end) {
            this.text = text;
            this.start = start;
            this.end = end;
        }
    }

    private static final class Hit {
        boolean matched;
        Object next = FREE;
        final List<String> prefixMatches = new ArrayList<>();
    }
}
