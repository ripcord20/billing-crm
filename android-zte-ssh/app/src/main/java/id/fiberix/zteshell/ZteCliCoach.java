package id.fiberix.zteshell;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Petunjuk perintah CLI ZTE C300/C320 (urutan kata / salah ketik).
 * Selaras dengan frontend/public/js/olt-cli-hints.js
 */
public final class ZteCliCoach {
    public static final class Hint {
        public final String correct;
        public final String reason;
        public final boolean highConfidence;
        public final String kind;
        public final List<String> alternatives;

        Hint(String correct, String reason, boolean highConfidence, String kind, List<String> alternatives) {
            this.correct = correct;
            this.reason = reason;
            this.highConfidence = highConfidence;
            this.kind = kind;
            this.alternatives = alternatives == null ? Collections.emptyList() : alternatives;
        }
    }

    private static final String[] COMMANDS = {
            "show card",
            "show card-temperature",
            "show processor",
            "show temperature",
            "show version",
            "show vlan summary",
            "show vlan",
            "show onu-type gpon",
            "show gpon onu uncfg",
            "show gpon onu state",
            "show gpon onu detail-info",
            "show gpon onu optical-info",
            "show gpon onu baseinfo",
            "show gpon onu remote-info",
            "show gpon profile tcont",
            "show gpon profile traffic",
            "show current-config",
            "show running-config",
            "show pon power attenuation",
            "show mac",
            "terminal length 0",
            "configure terminal"
    };

    private static final Set<String> EXACT_OK = setOf(
            "conf t", "configure t", "configure terminal", "conf terminal",
            "end", "exit", "write", "wr", "enable", "disable"
    );

    private static final Set<String> SKIP_FIRST = setOf(
            "interface", "pon-onu-mng", "onu", "int", "vlan", "tcont", "gemport",
            "service-port", "write", "end", "exit", "enable", "disable", "no",
            "qos", "igmp", "nni", "switchvlan"
    );

    private static final Map<String, String> ALIAS = aliasMap();
    private static final Set<String> DISTINCTIVE = setOf(
            "uncfg", "optical-info", "detail-info", "baseinfo", "remote-info",
            "card-temperature", "onu-type", "attenuation", "tcont"
    );
    private static final Set<String> TYPO_FROM = setOf(
            "sshow", "shw", "sho", "shwo", "showw", "sh0w", "diplay", "dispaly",
            "gponn", "gppon", "uncfgd", "temprature", "lenght", "termianl",
            "sumary", "crd"
    );
    private static final List<String> VOCAB = vocab();
    private static final Pattern LINE_HUAWEI_AUTOFIND =
            Pattern.compile("^display\\s+ont\\s+auto-?find(?:\\s+all)?$", Pattern.CASE_INSENSITIVE);
    private static final Pattern IFACE_ID =
            Pattern.compile("^\\d+/\\d+(?:/\\d+)?(?::\\d+)?$");

    private ZteCliCoach() {}

    public static Hint hint(String raw) {
        if (raw == null) return null;
        String typed = raw.replaceAll("\\s+", " ").trim();
        if (typed.isEmpty()) return null;
        String compact = typed.toLowerCase(Locale.ROOT);
        if (EXACT_OK.contains(compact)) return null;
        if (LINE_HUAWEI_AUTOFIND.matcher(compact).matches()) {
            return new Hint("show gpon onu uncfg",
                    "Itu perintah Huawei. Di ZTE: show gpon onu uncfg",
                    true, "alias", Collections.emptyList());
        }

        List<String> tokens = tokenize(typed);
        if (tokens.isEmpty()) return null;
        String first = tokens.get(0);
        String firstCanon = canonToken(first).canon;
        if (SKIP_FIRST.contains(first) && !"show".equals(firstCanon)
                && !"configure".equals(firstCanon) && !"terminal".equals(firstCanon)) {
            return null;
        }

        Peeled peeled = peel(tokens);
        List<String> core = peeled.core;
        List<String> args = peeled.args;
        if (core.isEmpty()) return null;
        String coreJoin = normalizeJoin(core);
        for (String cmd : COMMANDS) {
            if (coreJoin.equals(cmd)) return null;
        }

        boolean tooShort = core.size() < 2 && typed.replaceAll("\\s", "").length() < 8;
        List<Mapped> mapped = new ArrayList<>();
        for (String t : core) mapped.add(canonToken(t));

        List<Cand> best = new ArrayList<>();
        for (String cmd : COMMANDS) {
            List<String> ct = Arrays.asList(cmd.split("\\s+"));
            List<String> mappedCanon = new ArrayList<>();
            for (Mapped m : mapped) mappedCanon.add(m.canon);
            if (isPrefixOf(mappedCanon, ct) && equalsAtPrefix(mappedCanon, ct)) {
                Hit hit = new Hit();
                hit.score = 50 + core.size() * 8;
                for (int i = 0; i < mapped.size(); i++) {
                    Match mm = new Match();
                    mm.typed = mapped.get(i).from;
                    mm.cat = ct.get(i);
                    hit.matched.add(mm);
                }
                hit.missing.addAll(ct.subList(core.size(), ct.size()));
                Cand c = new Cand();
                c.cmd = cmd;
                c.hit = hit;
                c.prefix = true;
                best.add(c);
                continue;
            }
            Hit hit = scoreAgainst(mapped, ct);
            if (hit.matched.isEmpty()) continue;
            boolean distinctive = false;
            for (Match m : hit.matched) {
                if (DISTINCTIVE.contains(m.cat)) { distinctive = true; break; }
            }
            if (hit.score < 48 && !(distinctive && core.size() == 1)) continue;
            Cand c = new Cand();
            c.cmd = cmd;
            c.hit = hit;
            c.prefix = false;
            best.add(c);
        }

        if (best.isEmpty()) return null;
        Collections.sort(best, new Comparator<Cand>() {
            @Override public int compare(Cand a, Cand b) {
                int s = Double.compare(b.hit.score, a.hit.score);
                if (s != 0) return s;
                int m = Integer.compare(a.hit.missing.size(), b.hit.missing.size());
                if (m != 0) return m;
                return Integer.compare(a.cmd.length(), b.cmd.length());
            }
        });

        Cand top = best.get(0);
        Cand second = best.size() > 1 ? best.get(1) : null;
        boolean unique = second == null || (top.hit.score - second.hit.score) >= 8;
        String correct = withArgs(top.cmd, args);
        if (correct.equals(coreJoin) || correct.equals(compact)) return null;

        boolean isPrefix = top.prefix && !top.hit.orderWrong
                && top.hit.typos.isEmpty() && top.hit.aliases.isEmpty();
        if (isPrefix && tooShort) return null;
        boolean hasDist = false;
        for (Mapped m : mapped) {
            if (DISTINCTIVE.contains(m.canon)) { hasDist = true; break; }
        }
        if (!isPrefix && tooShort && !hasDist) return null;

        List<String> alternatives = new ArrayList<>();
        if (isPrefix) {
            for (Cand c : best) {
                if (!c.prefix) continue;
                String alt = withArgs(c.cmd, args);
                if (!alt.equals(correct)) alternatives.add(alt);
                if (alternatives.size() >= 2) break;
            }
        }

        boolean high = !isPrefix && unique && core.size() >= 2 && top.hit.score >= 72
                && top.hit.extra.size() <= 1;
        return new Hint(correct, buildReason(top.hit, correct), high, kindOf(top.hit, isPrefix), alternatives);
    }

    public static boolean looksLikeCliError(String chunk) {
        if (chunk == null) return false;
        String s = chunk.toLowerCase(Locale.ROOT);
        return s.contains("error 20200") || s.contains("error 20201")
                || s.contains("invalid command") || s.contains("invalid input")
                || s.contains("incomplete command") || s.contains("ambiguous command");
    }

    private static String buildReason(Hit hit, String correct) {
        List<String> parts = new ArrayList<>();
        if (!hit.typos.isEmpty()) {
            parts.add("Salah ketik: " + pairs(hit.typos));
        }
        if (!hit.aliases.isEmpty()) {
            parts.add("Kata ZTE: " + pairs(hit.aliases));
        }
        if (hit.orderWrong) parts.add("Urutan kata salah");
        if (!hit.missing.isEmpty() && !hit.matched.isEmpty()) {
            parts.add("Kurang kata: " + join(hit.missing));
        }
        if (parts.isEmpty() && !hit.missing.isEmpty()) parts.add("Lanjut yang sering dipakai");
        if (parts.isEmpty()) parts.add("Perintah tidak dikenali");
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < parts.size(); i++) {
            if (i > 0) sb.append(". ");
            sb.append(parts.get(i));
        }
        sb.append(". Yang benar: ").append(correct);
        return sb.toString();
    }

    private static String kindOf(Hit hit, boolean isPrefix) {
        if (isPrefix) return "prefix";
        if ((!hit.typos.isEmpty() || !hit.aliases.isEmpty()) && hit.orderWrong) return "both";
        if (hit.orderWrong) return "order";
        if (!hit.typos.isEmpty()) return "typo";
        if (!hit.aliases.isEmpty()) return "alias";
        if (!hit.missing.isEmpty()) return "missing";
        return "other";
    }

    private static Hit scoreAgainst(List<Mapped> coreMapped, List<String> catalogTokens) {
        boolean[] used = new boolean[catalogTokens.size()];
        List<Match> mapped = new ArrayList<>();
        for (Mapped tok : coreMapped) {
            int found = -1;
            for (int j = 0; j < catalogTokens.size(); j++) {
                if (used[j]) continue;
                if (catalogTokens.get(j).equals(tok.canon)) { found = j; break; }
            }
            Match m = new Match();
            m.typed = tok.from;
            m.canon = tok.canon;
            m.via = tok.via;
            if (found < 0) {
                mapped.add(m);
            } else {
                used[found] = true;
                m.cat = catalogTokens.get(found);
                m.pos = found;
                mapped.add(m);
            }
        }
        Hit hit = new Hit();
        for (Match m : mapped) if (m.cat != null) hit.matched.add(m);
        for (int j = 0; j < catalogTokens.size(); j++) {
            if (!used[j]) hit.missing.add(catalogTokens.get(j));
        }
        for (Match m : mapped) if (m.cat == null) hit.extra.add(m);
        int lastPos = -1;
        for (Match m : hit.matched) {
            if (m.pos < lastPos) hit.orderWrong = true;
            lastPos = m.pos;
        }
        for (Match m : hit.matched) {
            if (m.typed.equals(m.cat)) continue;
            if (TYPO_FROM.contains(m.typed) || "typo".equals(m.via)) {
                hit.typos.add(new String[]{m.typed, m.cat});
            } else if ("alias".equals(m.via) && m.cat.equals(ALIAS.get(m.typed))) {
                hit.aliases.add(new String[]{m.typed, m.cat});
            } else {
                hit.typos.add(new String[]{m.typed, m.cat});
            }
        }
        for (Match m : hit.extra) {
            if ("typo".equals(m.via) || "alias".equals(m.via)) {
                hit.typos.add(new String[]{m.typed, m.canon});
            }
        }
        double score = 0;
        if (!catalogTokens.isEmpty()) score += (hit.matched.size() / (double) catalogTokens.size()) * 70;
        if (!coreMapped.isEmpty()) score += (hit.matched.size() / (double) coreMapped.size()) * 30;
        if (hit.orderWrong) score -= 8;
        score -= hit.aliases.size() * 4;
        score -= hit.typos.size() * 8;
        score -= hit.missing.size() * 12;
        score -= hit.extra.size() * 18;
        for (Match m : hit.matched) {
            if (DISTINCTIVE.contains(m.cat)) score += 22;
        }
        hit.score = score;
        return hit;
    }

    private static Mapped canonToken(String t) {
        String k = t.toLowerCase(Locale.ROOT);
        if (ALIAS.containsKey(k)) return new Mapped(ALIAS.get(k), "alias", k);
        for (String key : ALIAS.keySet()) {
            if (close(k, key)) return new Mapped(ALIAS.get(key), "typo", k);
        }
        for (String key : VOCAB) {
            if (close(k, key)) {
                return new Mapped(key, k.equals(key) ? "exact" : "typo", k);
            }
        }
        return new Mapped(k, "exact", k);
    }

    private static List<String> tokenize(String s) {
        String x = s.replaceAll("ZXAN(?:\\([^)]+\\))?#", " ")
                .replaceAll("[?]+$", "")
                .trim()
                .toLowerCase(Locale.ROOT);
        String[] parts = x.split("[\\s,]+");
        List<String> out = new ArrayList<>();
        for (String p : parts) if (p != null && !p.isEmpty()) out.add(p);
        return out;
    }

    private static boolean isArg(String t) {
        String k = t.toLowerCase(Locale.ROOT);
        if (k.startsWith("gpon-olt_") || k.startsWith("gpon-onu_")
                || k.startsWith("epon-olt_") || k.startsWith("epon-onu_")) return true;
        return IFACE_ID.matcher(t).matches();
    }

    private static Peeled peel(List<String> tokens) {
        List<String> core = new ArrayList<>(tokens);
        List<String> args = new ArrayList<>();
        while (!core.isEmpty()) {
            String t = core.get(core.size() - 1);
            if ("all".equals(t) || isArg(t)) {
                args.add(0, core.remove(core.size() - 1));
            } else break;
        }
        Peeled p = new Peeled();
        p.core = core;
        p.args = args;
        return p;
    }

    private static String normalizeJoin(List<String> tokens) {
        return join(tokens).replaceAll("\\s+", " ").trim();
    }

    private static String withArgs(String cmd, List<String> args) {
        if (args == null || args.isEmpty()) return cmd;
        List<String> keep = new ArrayList<>();
        for (String a : args) if (!"all".equals(a)) keep.add(a);
        return keep.isEmpty() ? cmd : cmd + " " + join(keep);
    }

    private static boolean isPrefixOf(List<String> core, List<String> ct) {
        if (core.isEmpty() || core.size() >= ct.size()) return false;
        for (int i = 0; i < core.size(); i++) {
            if (!core.get(i).equals(ct.get(i))) return false;
        }
        return true;
    }

    private static boolean equalsAtPrefix(List<String> core, List<String> ct) {
        for (int i = 0; i < core.size(); i++) {
            if (!core.get(i).equals(ct.get(i))) return false;
        }
        return true;
    }

    private static int lev(String a, String b) {
        if (a.equals(b)) return 0;
        int al = a.length(), bl = b.length();
        if (al == 0) return bl;
        if (bl == 0) return al;
        int[] prev = new int[bl + 1];
        int[] cur = new int[bl + 1];
        for (int j = 0; j <= bl; j++) prev[j] = j;
        for (int i = 1; i <= al; i++) {
            cur[0] = i;
            for (int j = 1; j <= bl; j++) {
                int c = a.charAt(i - 1) == b.charAt(j - 1) ? 0 : 1;
                cur[j] = Math.min(Math.min(prev[j] + 1, cur[j - 1] + 1), prev[j - 1] + c);
            }
            int[] tmp = prev; prev = cur; cur = tmp;
        }
        return prev[bl];
    }

    private static boolean close(String a, String b) {
        if (a.equals(b)) return true;
        int d = lev(a, b);
        int max = Math.max(a.length(), b.length());
        if (max <= 2) return false;
        if (max <= 4) return d <= 1;
        return d <= 2;
    }

    private static String join(List<String> xs) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < xs.size(); i++) {
            if (i > 0) sb.append(' ');
            sb.append(xs.get(i));
        }
        return sb.toString();
    }

    private static String pairs(List<String[]> ps) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < ps.size(); i++) {
            if (i > 0) sb.append(", ");
            sb.append(ps.get(i)[0]).append(" → ").append(ps.get(i)[1]);
        }
        return sb.toString();
    }

    private static Set<String> setOf(String... xs) {
        return new LinkedHashSet<>(Arrays.asList(xs));
    }

    private static Map<String, String> aliasMap() {
        Map<String, String> m = new LinkedHashMap<>();
        m.put("sshow", "show"); m.put("shw", "show"); m.put("sho", "show");
        m.put("shwo", "show"); m.put("showw", "show"); m.put("sh0w", "show");
        m.put("sh", "show");
        m.put("display", "show"); m.put("diplay", "show"); m.put("dispaly", "show");
        m.put("disp", "show");
        m.put("unconf", "uncfg"); m.put("unconfig", "uncfg"); m.put("unconfigured", "uncfg");
        m.put("unconfigure", "uncfg"); m.put("un-cfg", "uncfg"); m.put("autofind", "uncfg");
        m.put("auto-find", "uncfg"); m.put("uncfgd", "uncfg");
        m.put("ont", "onu"); m.put("onus", "onu"); m.put("onts", "onu");
        m.put("gponn", "gpon"); m.put("gppon", "gpon");
        m.put("status", "state"); m.put("stat", "state"); m.put("sta", "state");
        m.put("stats", "state");
        m.put("crd", "card"); m.put("kartu", "card"); m.put("cards", "card");
        m.put("prosesor", "processor"); m.put("cpu", "processor"); m.put("proc", "processor");
        m.put("temprature", "temperature"); m.put("suhu", "temperature");
        m.put("temperatur", "temperature");
        m.put("vln", "vlan"); m.put("vlans", "vlan");
        m.put("sumary", "summary");
        m.put("conf", "configure"); m.put("config", "configure"); m.put("konfig", "configure");
        m.put("termianl", "terminal"); m.put("term", "terminal");
        m.put("lenght", "length");
        m.put("detail", "detail-info"); m.put("detailed", "detail-info");
        m.put("optical", "optical-info"); m.put("optic", "optical-info");
        m.put("base-info", "baseinfo");
        m.put("remote", "remote-info");
        return m;
    }

    private static List<String> vocab() {
        Set<String> s = new LinkedHashSet<>();
        for (String c : COMMANDS) s.addAll(Arrays.asList(c.split("\\s+")));
        return new ArrayList<>(s);
    }

    private static final class Mapped {
        final String canon, via, from;
        Mapped(String canon, String via, String from) {
            this.canon = canon; this.via = via; this.from = from;
        }
    }
    private static final class Match {
        String typed, canon, via, cat;
        int pos;
    }
    private static final class Hit {
        double score;
        List<Match> matched = new ArrayList<>();
        List<String> missing = new ArrayList<>();
        List<Match> extra = new ArrayList<>();
        boolean orderWrong;
        List<String[]> typos = new ArrayList<>();
        List<String[]> aliases = new ArrayList<>();
    }
    private static final class Cand {
        String cmd;
        Hit hit;
        boolean prefix;
    }
    private static final class Peeled {
        List<String> core;
        List<String> args;
    }

    /** javac + java id.fiberix.zteshell.ZteCliCoach --selftest */
    public static void main(String[] args) {
        if (args.length == 1 && "--selftest".equals(args[0])) {
            selftest();
            System.out.println("✓ ZteCliCoach selftest PASS");
            return;
        }
        if (args.length >= 1) {
            Hint h = hint(join(Arrays.asList(args)));
            System.out.println(h == null ? "null" : h.kind + " " + h.highConfidence + " " + h.correct + " | " + h.reason);
        }
    }

    private static void expect(String typed, String want) {
        Hint h = hint(typed);
        if (want == null) {
            if (h != null) throw new AssertionError(typed + " expected null, got " + h.correct);
            return;
        }
        if (h == null) throw new AssertionError(typed + " expected " + want + ", got null");
        if (!want.equals(h.correct)) throw new AssertionError(typed + " → " + h.correct + " want " + want);
    }

    private static void expectHigh(String typed, String want) {
        expect(typed, want);
        Hint h = hint(typed);
        if (!h.highConfidence) throw new AssertionError(typed + " should be high confidence");
    }

    private static void selftest() {
        expectHigh("show onu gpon unconf", "show gpon onu uncfg");
        expectHigh("sshow onu gpon uncfg", "show gpon onu uncfg");
        expectHigh("show gpon onu unconf", "show gpon onu uncfg");
        expectHigh("show onu gpon uncfg", "show gpon onu uncfg");
        expect("show gpon onu uncfg", null);
        expect("conf t", null);
        expect("show gpon onu state gpon-olt_1/1/1", null);
        expectHigh("sshow card", "show card");
        expectHigh("show gpon onu status", "show gpon onu state");
        expect("display ont autofind", "show gpon onu uncfg");
        expect("interface gpon-olt_1/1/1", null);
        expectHigh("show onu gpon unconf gpon-olt_1/2/1", "show gpon onu uncfg gpon-olt_1/2/1");
        Hint u = hint("unconf");
        if (u == null || !"show gpon onu uncfg".equals(u.correct) || u.highConfidence) {
            throw new AssertionError("unconf hint mismatch");
        }
    }
}
