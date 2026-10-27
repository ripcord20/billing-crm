package id.fiberix.zteshell;

import android.Manifest;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.text.InputType;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputMethodManager;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.ContextCompat;

public class TerminalActivity extends AppCompatActivity implements OltSession.Listener {
    private static final long PASTE_LINE_MS = 120L;
    private static final String[] ZTE_CMDS = {
            "show card",
            "show gpon onu uncfg",
            "show gpon onu state gpon-olt_1/1/1",
            "show processor",
            "show temperature",
            "show vlan summary",
            "show onu-type gpon",
            "terminal length 0"
    };

    private TextView out;
    private ScrollView scroll;
    private EditText cmd;
    private OltSession session;
    private final StringBuilder buf = new StringBuilder();
    private final Handler main = new Handler(Looper.getMainLooper());
    private final CommandHistory history = new CommandHistory();
    private int sendSeq;
    private PowerManager.WakeLock wakeLock;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_terminal);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().setSoftInputMode(
                WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE
                        | WindowManager.LayoutParams.SOFT_INPUT_STATE_VISIBLE);

        String id = getIntent().getStringExtra(LoginActivity.EXTRA_PROFILE_ID);
        OltProfile profile = new ProfileStore(this).find(id);
        if (profile == null) {
            Toast.makeText(this, "Profil tidak ditemukan", Toast.LENGTH_SHORT).show();
            finish();
            return;
        }

        TextView title = findViewById(R.id.title);
        title.setText(profile.label());
        out = findViewById(R.id.termOut);
        scroll = findViewById(R.id.termScroll);
        cmd = findViewById(R.id.cmd);
        // Output boleh di-select, tapi jangan mencuri fokus (itu yang menelan keyboard).
        out.setTextIsSelectable(true);
        out.setFocusable(false);
        out.setFocusableInTouchMode(false);
        scroll.setFocusable(false);
        scroll.setFocusableInTouchMode(false);
        scroll.setDescendantFocusability(LinearLayout.FOCUS_BLOCK_DESCENDANTS);

        cmd.setInputType(InputType.TYPE_CLASS_TEXT
                | InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD
                | InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS
                | InputType.TYPE_TEXT_FLAG_MULTI_LINE);
        cmd.setImeOptions(EditorInfo.IME_ACTION_SEND
                | EditorInfo.IME_FLAG_NO_EXTRACT_UI
                | EditorInfo.IME_FLAG_NO_FULLSCREEN);
        cmd.setShowSoftInputOnFocus(true);
        cmd.setFocusable(true);
        cmd.setFocusableInTouchMode(true);

        LinearLayout chips = findViewById(R.id.chips);
        int pad = (int) (8 * getResources().getDisplayMetrics().density);
        for (String c : ZTE_CMDS) {
            Button b = new Button(this);
            b.setText(c);
            b.setAllCaps(false);
            b.setTextSize(11f);
            b.setMinHeight(0);
            b.setMinimumHeight(0);
            b.setPadding(pad, pad / 2, pad, pad / 2);
            b.setTextColor(ContextCompat.getColor(this, R.color.accent));
            b.setBackgroundResource(R.drawable.bg_chip);
            b.setBackgroundTintList(null);
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT);
            lp.setMarginEnd(pad);
            b.setLayoutParams(lp);
            b.setOnClickListener(v -> sendLine(c));
            chips.addView(b);
        }

        findViewById(R.id.btnCopy).setOnClickListener(v -> copyOutput());
        findViewById(R.id.btnPaste).setOnClickListener(v -> pasteIntoBox());
        findViewById(R.id.btnHistUp).setOnClickListener(v -> historyUp());
        findViewById(R.id.btnHistDown).setOnClickListener(v -> historyDown());
        findViewById(R.id.btnSend).setOnClickListener(v -> sendFromBox());
        findViewById(R.id.btnDisconnect).setOnClickListener(v -> {
            if (session != null) session.disconnect();
            finish();
        });
        cmd.setOnClickListener(v -> showCommandIme());
        cmd.setOnFocusChangeListener((v, hasFocus) -> {
            if (hasFocus) showCommandIme();
        });
        cmd.setOnTouchListener((v, event) -> {
            if (event.getAction() == MotionEvent.ACTION_DOWN) {
                v.requestFocus();
                showCommandIme();
            }
            return false;
        });
        // Tap layar terminal = ketik perintah (seperti klien SSH biasa).
        View.OnClickListener openIme = v -> showCommandIme();
        scroll.setOnClickListener(openIme);
        out.setOnClickListener(openIme);
        cmd.setOnEditorActionListener((v, actionId, event) -> {
            if (actionId == EditorInfo.IME_ACTION_SEND
                    || actionId == EditorInfo.IME_ACTION_DONE
                    || (event != null && event.getKeyCode() == KeyEvent.KEYCODE_ENTER
                    && event.getAction() == KeyEvent.ACTION_UP)) {
                sendFromBox();
                return true;
            }
            return false;
        });
        cmd.setOnKeyListener((v, keyCode, event) -> {
            if (event.getAction() != KeyEvent.ACTION_UP) return false;
            if (keyCode == KeyEvent.KEYCODE_ENTER) {
                sendFromBox();
                return true;
            }
            if (keyCode == KeyEvent.KEYCODE_DPAD_UP) {
                historyUp();
                return true;
            }
            if (keyCode == KeyEvent.KEYCODE_DPAD_DOWN) {
                historyDown();
                return true;
            }
            return false;
        });

        requestNotifyPermission();
        acquireWakeLock();
        OltKeepAliveService.start(this, profile.label());
        append("[menghubungkan ke " + profile.host + "…]\n");
        session = new OltSession(profile, this);
        session.connect();
        cmd.post(this::showCommandIme);
    }

    private void requestNotifyPermission() {
        if (Build.VERSION.SDK_INT < 33) return;
        if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                == PackageManager.PERMISSION_GRANTED) return;
        requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 41);
    }

    private void acquireWakeLock() {
        releaseWakeLock();
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (pm == null) return;
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "zteshell:session");
        wakeLock.setReferenceCounted(false);
        wakeLock.acquire(3 * 60 * 60 * 1000L);
    }

    private void releaseWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) {
            try { wakeLock.release(); } catch (Exception ignored) {}
        }
        wakeLock = null;
    }

    private void showCommandIme() {
        if (cmd == null) return;
        cmd.setFocusable(true);
        cmd.setFocusableInTouchMode(true);
        cmd.requestFocus();
        cmd.post(() -> {
            InputMethodManager imm = (InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE);
            if (imm != null) {
                imm.restartInput(cmd);
                imm.showSoftInput(cmd, InputMethodManager.SHOW_FORCED);
            }
            if (Build.VERSION.SDK_INT >= 30) {
                try {
                    if (cmd.getWindowInsetsController() != null) {
                        cmd.getWindowInsetsController().show(WindowInsets.Type.ime());
                    }
                } catch (Exception ignored) {
                }
            }
        });
    }

    private void copyOutput() {
        String selected = selectedOutput();
        String text = selected != null ? selected : buf.toString();
        if (text.trim().isEmpty()) {
            Toast.makeText(this, R.string.copy_empty, Toast.LENGTH_SHORT).show();
            return;
        }
        ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
        cm.setPrimaryClip(ClipData.newPlainText("OLT output", text));
        Toast.makeText(this,
                selected != null ? R.string.copied_sel : R.string.copied,
                Toast.LENGTH_SHORT).show();
    }

    private String selectedOutput() {
        int start = out.getSelectionStart();
        int end = out.getSelectionEnd();
        if (start < 0 || end <= start) return null;
        CharSequence seq = out.getText();
        if (seq == null) return null;
        int lo = Math.max(0, Math.min(start, seq.length()));
        int hi = Math.max(0, Math.min(end, seq.length()));
        if (hi <= lo) return null;
        return seq.subSequence(lo, hi).toString();
    }

    private void historyUp() {
        String next = history.up(cmd.getText().toString());
        if (next == null) {
            Toast.makeText(this, R.string.hist_empty, Toast.LENGTH_SHORT).show();
            return;
        }
        fillCommand(next);
    }

    private void historyDown() {
        String next = history.down();
        if (next == null) return;
        fillCommand(next);
    }

    private void fillCommand(String text) {
        cmd.setText(text);
        cmd.setSelection(text.length());
        showCommandIme();
    }

    private void pasteIntoBox() {
        ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
        if (cm == null || !cm.hasPrimaryClip() || cm.getPrimaryClip() == null
                || cm.getPrimaryClip().getItemCount() == 0) {
            Toast.makeText(this, R.string.paste_empty, Toast.LENGTH_SHORT).show();
            return;
        }
        CharSequence t = cm.getPrimaryClip().getItemAt(0).coerceToText(this);
        if (t == null || t.toString().trim().isEmpty()) {
            Toast.makeText(this, R.string.paste_empty, Toast.LENGTH_SHORT).show();
            return;
        }
        String pasted = t.toString();
        cmd.setText(pasted);
        cmd.setSelection(cmd.getText().length());
        int n = lineCount(pasted);
        Toast.makeText(this,
                n > 1 ? getString(R.string.pasted_n, n) : getString(R.string.pasted),
                Toast.LENGTH_SHORT).show();
        showCommandIme();
    }

    private void sendFromBox() {
        String raw = cmd.getText().toString();
        cmd.setText("");
        showCommandIme();
        String[] lines = raw.replace("\r\n", "\n").replace('\r', '\n').split("\n", -1);
        int n = lines.length;
        if (n > 0 && lines[n - 1].isEmpty()) n--;
        if (n <= 0) {
            sendLine("");
            return;
        }
        if (n == 1) {
            sendLine(lines[0]);
            return;
        }
        final int seq = ++sendSeq;
        for (int i = 0; i < n; i++) {
            final String line = lines[i];
            main.postDelayed(() -> {
                if (seq != sendSeq) return;
                sendLine(line);
            }, i * PASTE_LINE_MS);
        }
    }

    private static int lineCount(String s) {
        String[] lines = s.replace("\r\n", "\n").replace('\r', '\n').split("\n", -1);
        int n = lines.length;
        if (n > 0 && lines[n - 1].isEmpty()) n--;
        return Math.max(n, 1);
    }

    private void sendLine(String line) {
        if (line == null) return;
        String t = line.trim();
        if (t.isEmpty()) {
            if (session != null) session.send("\n");
            return;
        }
        history.add(t);
        append(t + "\n");
        if (session != null) session.send(t);
    }

    private void append(String s) {
        buf.append(s);
        if (buf.length() > 120_000) buf.delete(0, buf.length() - 80_000);
        boolean cmdHadFocus = cmd != null && cmd.hasFocus();
        out.setText(buf.toString());
        scrollToEnd();
        if (cmdHadFocus) cmd.requestFocus();
    }

    /** Scroll tanpa fullScroll(FOCUS_DOWN) — itu memindah fokus ke TextView dan menutup keyboard. */
    private void scrollToEnd() {
        scroll.post(() -> {
            int childH = out.getHeight();
            int viewH = scroll.getHeight();
            int y = Math.max(0, childH - viewH);
            scroll.scrollTo(0, y);
        });
    }

    @Override
    public void onOutput(String chunk) {
        append(chunk);
    }

    @Override
    public void onClosed(String reason) {
        append("\n[" + reason + "]\n");
        OltKeepAliveService.stop(this);
        releaseWakeLock();
    }

    @Override
    protected void onDestroy() {
        sendSeq++;
        main.removeCallbacksAndMessages(null);
        OltKeepAliveService.stop(this);
        releaseWakeLock();
        if (session != null) session.disconnect();
        super.onDestroy();
    }
}
