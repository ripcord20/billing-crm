package id.fiberix.zteshell;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.text.TextUtils;
import android.view.View;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ListView;
import android.widget.RadioButton;
import android.widget.RadioGroup;
import android.widget.TextView;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;

import java.util.ArrayList;
import java.util.List;

public class LoginActivity extends AppCompatActivity {
    static final String EXTRA_PROFILE_ID = "profile_id";

    private ProfileStore store;
    private List<OltProfile> profiles = new ArrayList<>();
    private ArrayAdapter<String> adapter;
    private OltProfile selected;

    private EditText name;
    private EditText host;
    private EditText port;
    private EditText user;
    private EditText password;
    private EditText enable;
    private RadioButton protoSsh;
    private ListView list;
    private TextView emptyHint;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_login);
        InsetFit.apply(findViewById(R.id.loginRoot));
        store = new ProfileStore(this);

        name = findViewById(R.id.name);
        host = findViewById(R.id.host);
        port = findViewById(R.id.port);
        user = findViewById(R.id.user);
        password = findViewById(R.id.password);
        enable = findViewById(R.id.enable);
        protoSsh = findViewById(R.id.protoSsh);
        RadioButton protoTelnet = findViewById(R.id.protoTelnet);
        RadioGroup proto = findViewById(R.id.proto);
        list = findViewById(R.id.profileList);
        emptyHint = findViewById(R.id.emptyHint);
        Button btnSave = findViewById(R.id.btnSave);
        Button btnConnect = findViewById(R.id.btnConnect);
        Button btnDelete = findViewById(R.id.btnDelete);

        adapter = new ArrayAdapter<>(this, R.layout.item_profile, new ArrayList<>());
        list.setAdapter(adapter);
        list.setOnItemClickListener((parent, view, position, id) -> {
            selected = profiles.get(position);
            fillForm(selected);
        });

        proto.setOnCheckedChangeListener((g, id) -> {
            if (id == R.id.protoTelnet && "22".equals(port.getText().toString().trim())) {
                port.setText("23");
            } else if (id == R.id.protoSsh && "23".equals(port.getText().toString().trim())) {
                port.setText("22");
            }
        });

        btnSave.setOnClickListener(v -> {
            OltProfile p = fromForm();
            if (p == null) return;
            if (selected != null) p.id = selected.id;
            store.save(p);
            selected = p;
            reload();
            Toast.makeText(this, "Profil disimpan", Toast.LENGTH_SHORT).show();
        });

        btnConnect.setOnClickListener(v -> {
            OltProfile p = fromForm();
            if (p == null) return;
            if (selected != null) p.id = selected.id;
            store.save(p);
            Intent i = new Intent(this, TerminalActivity.class);
            i.putExtra(EXTRA_PROFILE_ID, p.id);
            startActivity(i);
        });

        btnDelete.setOnClickListener(v -> {
            if (selected == null || TextUtils.isEmpty(selected.id)) {
                Toast.makeText(this, "Pilih profil dulu", Toast.LENGTH_SHORT).show();
                return;
            }
            store.delete(selected.id);
            selected = null;
            clearForm();
            reload();
        });

        findViewById(R.id.btnScripts).setOnClickListener(v ->
                startActivity(new Intent(this, ScriptLibraryActivity.class)));
        findViewById(R.id.privacyLink).setOnClickListener(v ->
                startActivity(new Intent(this, PrivacyActivity.class)));

        protoSsh.setChecked(true);
        protoTelnet.setChecked(false);
        requestNotifyPermission();
        reload();
    }

    private void requestNotifyPermission() {
        if (Build.VERSION.SDK_INT < 33) return;
        if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                == PackageManager.PERMISSION_GRANTED) return;
        requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 42);
    }

    private void reload() {
        profiles = store.all();
        List<String> labels = new ArrayList<>();
        for (OltProfile p : profiles) labels.add(p.label());
        adapter.clear();
        adapter.addAll(labels);
        emptyHint.setVisibility(profiles.isEmpty() ? View.VISIBLE : View.GONE);
    }

    private void fillForm(OltProfile p) {
        name.setText(p.name);
        host.setText(p.host);
        port.setText(String.valueOf(p.port));
        user.setText(p.username);
        password.setText(p.password);
        enable.setText(p.enablePassword);
        protoSsh.setChecked(p.ssh);
        ((RadioButton) findViewById(R.id.protoTelnet)).setChecked(!p.ssh);
    }

    private void clearForm() {
        name.setText("");
        host.setText("");
        port.setText("22");
        user.setText("");
        password.setText("");
        enable.setText("");
        protoSsh.setChecked(true);
    }

    private OltProfile fromForm() {
        OltProfile p = new OltProfile();
        p.name = name.getText().toString().trim();
        p.host = host.getText().toString().trim();
        p.username = user.getText().toString().trim();
        p.password = password.getText().toString();
        p.enablePassword = enable.getText().toString();
        p.ssh = protoSsh.isChecked();
        try {
            p.port = Integer.parseInt(port.getText().toString().trim());
        } catch (Exception e) {
            p.port = p.ssh ? 22 : 23;
        }
        if (p.host.isEmpty()) {
            Toast.makeText(this, "IP OLT wajib diisi", Toast.LENGTH_SHORT).show();
            return null;
        }
        if (p.name.isEmpty()) p.name = p.host;
        return p;
    }
}
