package id.fiberix.zteshell;

import android.os.Bundle;
import android.text.method.ScrollingMovementMethod;
import android.view.KeyEvent;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.ContextCompat;

public class TerminalActivity extends AppCompatActivity implements OltSession.Listener {
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

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_terminal);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

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
        out.setMovementMethod(new ScrollingMovementMethod());

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
            b.setTextColor(ContextCompat.getColor(this, R.color.text));
            b.setBackgroundTintList(ContextCompat.getColorStateList(this, R.color.bg_input));
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT);
            lp.setMarginEnd(pad);
            b.setLayoutParams(lp);
            b.setOnClickListener(v -> sendLine(c));
            chips.addView(b);
        }

        findViewById(R.id.btnSend).setOnClickListener(v -> sendFromBox());
        findViewById(R.id.btnDisconnect).setOnClickListener(v -> {
            if (session != null) session.disconnect();
            finish();
        });
        cmd.setOnKeyListener((v, keyCode, event) -> {
            if (keyCode == KeyEvent.KEYCODE_ENTER && event.getAction() == KeyEvent.ACTION_UP) {
                sendFromBox();
                return true;
            }
            return false;
        });

        append("[menghubungkan ke " + profile.host + "…]\n");
        session = new OltSession(profile, this);
        session.connect();
    }

    private void sendFromBox() {
        String line = cmd.getText().toString();
        cmd.setText("");
        sendLine(line);
    }

    private void sendLine(String line) {
        if (line == null) return;
        String t = line.trim();
        if (t.isEmpty()) {
            if (session != null) session.send("\n");
            return;
        }
        append(t + "\n");
        if (session != null) session.send(t);
    }

    private void append(String s) {
        buf.append(s);
        if (buf.length() > 120_000) buf.delete(0, buf.length() - 80_000);
        out.setText(buf.toString());
        scroll.post(() -> scroll.fullScroll(ScrollView.FOCUS_DOWN));
    }

    @Override
    public void onOutput(String chunk) {
        append(chunk);
    }

    @Override
    public void onClosed(String reason) {
        append("\n[" + reason + "]\n");
    }

    @Override
    protected void onDestroy() {
        if (session != null) session.disconnect();
        super.onDestroy();
    }
}
