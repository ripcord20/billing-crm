package id.fiberix.zteshell;

import android.os.Bundle;
import android.text.TextUtils;
import android.widget.EditText;
import android.widget.Toast;

import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatActivity;

public class ScriptEditorActivity extends AppCompatActivity {
    static final String EXTRA_ID = "script_id";
    static final String EXTRA_PREFILL_BODY = "prefill_body";

    private ScriptStore store;
    private SavedScript current;
    private EditText name;
    private EditText note;
    private EditText body;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_script_edit);
        InsetFit.apply(findViewById(R.id.scriptEditRoot));
        store = new ScriptStore(this);
        name = findViewById(R.id.scriptName);
        note = findViewById(R.id.scriptNote);
        body = findViewById(R.id.scriptBody);

        String id = getIntent().getStringExtra(EXTRA_ID);
        if (!TextUtils.isEmpty(id)) current = store.find(id);
        if (current != null) {
            name.setText(current.name);
            note.setText(current.note);
            body.setText(current.body);
        } else {
            String pre = getIntent().getStringExtra(EXTRA_PREFILL_BODY);
            if (!TextUtils.isEmpty(pre)) body.setText(pre);
        }

        findViewById(R.id.btnEditBack).setOnClickListener(v -> finish());
        findViewById(R.id.btnScriptSave).setOnClickListener(v -> save());
        findViewById(R.id.btnScriptDelete).setOnClickListener(v -> confirmDelete());
    }

    private void save() {
        SavedScript s = current == null ? new SavedScript() : current;
        s.name = name.getText().toString().trim();
        s.note = note.getText().toString().trim();
        s.body = body.getText().toString();
        if (s.body.trim().isEmpty()) {
            Toast.makeText(this, R.string.script_body_empty, Toast.LENGTH_SHORT).show();
            return;
        }
        if (s.name.isEmpty()) {
            int n = s.lineCount();
            s.name = n + " baris skrip";
        }
        s.builtin = false;
        store.save(s);
        Toast.makeText(this, R.string.script_saved, Toast.LENGTH_SHORT).show();
        finish();
    }

    private void confirmDelete() {
        if (current == null || TextUtils.isEmpty(current.id)) {
            finish();
            return;
        }
        new AlertDialog.Builder(this)
                .setMessage(R.string.script_delete_q)
                .setNegativeButton(R.string.privacy_back, null)
                .setPositiveButton(R.string.script_delete, (d, w) -> {
                    store.delete(current.id);
                    Toast.makeText(this, R.string.script_deleted, Toast.LENGTH_SHORT).show();
                    finish();
                })
                .show();
    }
}
