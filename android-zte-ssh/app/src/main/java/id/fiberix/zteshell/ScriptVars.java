package id.fiberix.zteshell;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Placeholder skrip: {SN} {PON} {VLAN} dst.
 * Diisi lewat dialog saat teknisi mengambil skrip, bukan saat menyimpan.
 */
public final class ScriptVars {
    private static final Pattern TOKEN = Pattern.compile("\\{([A-Z][A-Z0-9_]{0,24})\\}");

    private ScriptVars() {}

    public static List<String> names(String body) {
        List<String> out = new ArrayList<>();
        if (body == null || body.isEmpty()) return out;
        Matcher m = TOKEN.matcher(body);
        while (m.find()) {
            String n = m.group(1);
            if (!out.contains(n)) out.add(n);
        }
        return out;
    }

    public static String apply(String body, Map<String, String> values) {
        if (body == null) return "";
        if (values == null || values.isEmpty()) return body;
        Matcher m = TOKEN.matcher(body);
        StringBuffer sb = new StringBuffer();
        while (m.find()) {
            String key = m.group(1);
            String v = values.get(key);
            if (v == null) v = m.group(0);
            m.appendReplacement(sb, Matcher.quoteReplacement(v));
        }
        m.appendTail(sb);
        return sb.toString();
    }

    public static Map<String, String> emptyValues(String body) {
        Map<String, String> map = new LinkedHashMap<>();
        for (String n : names(body)) map.put(n, "");
        return map;
    }

    public static int lineCount(String s) {
        if (s == null || s.isEmpty()) return 0;
        String[] lines = s.replace("\r\n", "\n").replace('\r', '\n').split("\n", -1);
        int n = lines.length;
        if (n > 0 && lines[n - 1].isEmpty()) n--;
        return Math.max(n, 0);
    }
}
