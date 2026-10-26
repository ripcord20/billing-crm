package id.fiberix.zteshell;

import android.os.Handler;
import android.os.Looper;
import android.text.TextUtils;

import com.jcraft.jsch.ChannelShell;
import com.jcraft.jsch.JSch;
import com.jcraft.jsch.Session;
import com.jcraft.jsch.UIKeyboardInteractive;
import com.jcraft.jsch.UserInfo;

import org.apache.commons.net.telnet.TelnetClient;

import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Pattern;

/**
 * Sesi interaktif ke OLT ZTE (SSH atau Telnet).
 * Algoritma SSH mengikuti BaseCliOltService: Dropbear / OLT lama
 * (ssh-rsa, group1, 3des) plus keyboard-interactive.
 */
public class OltSession {
    public interface Listener {
        void onOutput(String chunk);
        void onClosed(String reason);
    }

    private static final Pattern MORE = Pattern.compile("(?i)--\\s*more\\s*--|----more----");
    private static final Pattern ANSI = Pattern.compile("\\u001B\\[[0-9;?]*[A-Za-z]");

    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final Handler main = new Handler(Looper.getMainLooper());
    private final OltProfile profile;
    private final Listener listener;

    private volatile boolean running;
    private Session ssh;
    private ChannelShell shell;
    private TelnetClient telnet;
    private OutputStream out;

    public OltSession(OltProfile profile, Listener listener) {
        this.profile = profile;
        this.listener = listener;
    }

    public void connect() {
        io.execute(() -> {
            try {
                if (profile.ssh) openSsh();
                else openTelnet();
                running = true;
                emit("\n[terhubung " + (profile.ssh ? "SSH" : "Telnet") + " " + profile.host + ":" + profile.port + "]\n");
                Thread reader = new Thread(this::readLoop, "olt-read");
                reader.setDaemon(true);
                reader.start();
                Thread.sleep(500);
                sendRaw("terminal length 0\n");
                if (!TextUtils.isEmpty(profile.enablePassword)) {
                    Thread.sleep(400);
                    sendRaw("enable\n");
                    Thread.sleep(250);
                    sendRaw(profile.enablePassword + "\n");
                }
            } catch (Exception e) {
                emit("\n[gagal: " + friendly(e) + "]\n");
                main.post(() -> listener.onClosed(friendly(e)));
                closeQuiet();
            }
        });
    }

    public void send(String line) {
        io.execute(() -> sendRaw(line.endsWith("\n") ? line : line + "\n"));
    }

    public void disconnect() {
        running = false;
        io.execute(this::closeQuiet);
    }

    private void openSsh() throws Exception {
        JSch jsch = new JSch();
        JSch.setConfig("kex",
                "curve25519-sha256,curve25519-sha256@libssh.org,ecdh-sha2-nistp256,"
                        + "diffie-hellman-group14-sha256,diffie-hellman-group14-sha1,"
                        + "diffie-hellman-group1-sha1,diffie-hellman-group-exchange-sha1");
        JSch.setConfig("cipher.s2c", "aes128-ctr,aes256-ctr,aes128-cbc,aes256-cbc,3des-cbc");
        JSch.setConfig("cipher.c2s", "aes128-ctr,aes256-ctr,aes128-cbc,aes256-cbc,3des-cbc");
        JSch.setConfig("server_host_key",
                "ssh-rsa,rsa-sha2-256,rsa-sha2-512,ssh-dss,ecdsa-sha2-nistp256,ssh-ed25519");
        JSch.setConfig("mac.s2c", "hmac-sha2-256,hmac-sha1,hmac-sha1-96");
        JSch.setConfig("mac.c2s", "hmac-sha2-256,hmac-sha1,hmac-sha1-96");
        JSch.setConfig("StrictHostKeyChecking", "no");
        JSch.setConfig("PreferredAuthentications", "password,keyboard-interactive");

        ssh = jsch.getSession(profile.username, profile.host, profile.port);
        ssh.setPassword(profile.password == null ? "" : profile.password);
        ssh.setUserInfo(new PassUserInfo(profile.password));
        ssh.setTimeout(15000);
        ssh.connect(15000);
        shell = (ChannelShell) ssh.openChannel("shell");
        shell.setPtyType("vt100");
        shell.setPtySize(120, 40, 800, 600);
        shell.connect(8000);
        out = shell.getOutputStream();
    }

    private void openTelnet() throws Exception {
        telnet = new TelnetClient();
        telnet.setConnectTimeout(15000);
        telnet.setDefaultTimeout(0);
        telnet.connect(profile.host, profile.port);
        out = telnet.getOutputStream();
        // Login banner ZTE: Username / Password
        Thread.sleep(400);
        if (!TextUtils.isEmpty(profile.username)) {
            sendRaw(profile.username + "\n");
            Thread.sleep(300);
        }
        if (!TextUtils.isEmpty(profile.password)) {
            sendRaw(profile.password + "\n");
        }
    }

    private void readLoop() {
        try {
            InputStream in = profile.ssh ? shell.getInputStream() : telnet.getInputStream();
            byte[] buf = new byte[4096];
            StringBuilder moreAcc = new StringBuilder();
            while (running) {
                int n = in.read(buf);
                if (n < 0) break;
                String chunk = new String(buf, 0, n, StandardCharsets.UTF_8);
                chunk = ANSI.matcher(chunk).replaceAll("").replace("\r", "");
                emit(chunk);
                moreAcc.append(chunk);
                if (moreAcc.length() > 400) moreAcc.delete(0, moreAcc.length() - 400);
                if (MORE.matcher(moreAcc).find()) {
                    sendRaw(" ");
                    moreAcc.setLength(0);
                }
            }
            main.post(() -> listener.onClosed("Sesi ditutup OLT"));
        } catch (Exception e) {
            if (running) {
                emit("\n[putus: " + friendly(e) + "]\n");
                main.post(() -> listener.onClosed(friendly(e)));
            }
        } finally {
            closeQuiet();
        }
    }

    private void sendRaw(String data) {
        try {
            if (out == null) return;
            out.write(data.getBytes(StandardCharsets.UTF_8));
            out.flush();
        } catch (Exception e) {
            emit("\n[kirim gagal: " + e.getMessage() + "]\n");
        }
    }

    private void emit(String s) {
        if (s == null || s.isEmpty()) return;
        main.post(() -> listener.onOutput(s));
    }

    private void closeQuiet() {
        running = false;
        try { if (shell != null) shell.disconnect(); } catch (Exception ignored) {}
        try { if (ssh != null) ssh.disconnect(); } catch (Exception ignored) {}
        try { if (telnet != null) telnet.disconnect(); } catch (Exception ignored) {}
        shell = null;
        ssh = null;
        telnet = null;
        out = null;
    }

    static String friendly(Exception e) {
        String m = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
        if (m.matches("(?i).*(auth|permission denied|authentication methods failed).*")) {
            return "Login ditolak OLT. Username atau password salah.";
        }
        if (m.matches("(?i).*timed? ?out.*")) {
            return "Timeout. Pastikan HP satu jaringan / VPN dengan OLT.";
        }
        if (m.matches("(?i).*no matching.*")) {
            return "Handshake SSH gagal (algoritma). Coba Telnet (port 23) jika OLT membukanya.";
        }
        if (m.matches("(?i).*connection refused.*")) {
            return "Koneksi ditolak. Cek IP, port, dan apakah SSH/Telnet aktif di OLT.";
        }
        return m;
    }

    private static class PassUserInfo implements UserInfo, UIKeyboardInteractive {
        private final String password;

        PassUserInfo(String password) {
            this.password = password == null ? "" : password;
        }

        @Override public String getPassword() { return password; }
        @Override public boolean promptPassword(String s) { return true; }
        @Override public boolean promptPassphrase(String s) { return false; }
        @Override public String getPassphrase() { return null; }
        @Override public boolean promptYesNo(String s) { return true; }
        @Override public void showMessage(String s) { }

        @Override
        public String[] promptKeyboardInteractive(String dest, String name, String instruction,
                                                  String[] prompt, boolean[] echo) {
            String[] resp = new String[prompt == null ? 0 : prompt.length];
            Arrays.fill(resp, password);
            return resp;
        }
    }
}
