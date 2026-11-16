package id.fiberix.zteshell;

import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.text.InputType;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.BaseAdapter;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ListView;
import android.widget.TextView;
import android.widget.Toast;

import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.ContextCompat;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public class ScriptLibraryActivity extends AppCompatActivity {
    static final String EXTRA_PICK = "pick";
    static final String EXTRA_DRAFT = "draft";
    static final String EXTRA_BODY = "body";

    private ScriptStore store;
    private final List<SavedScript> scripts = new ArrayList<>();
    private ScriptAdapter adapter;
    private boolean pick;
    private String draft;
    private TextView empty;
    private TextView hint;

    static Intent pickIntent(Context ctx, String draft) {
        Intent i = new Intent(ctx, ScriptLibraryActivity.class);
        i.putExtra(EXTRA_PICK, true);
        if (draft != null) i.putExtra(EXTRA_DRAFT, draft);
        return i;
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_scripts);
        InsetFit.apply(findViewById(R.id.scriptsRoot));
        store = new ScriptStore(this);
        pick = getIntent().getBooleanExtra(EXTRA_PICK, false);
        draft = getIntent().getStringExtra(EXTRA_DRAFT);
        if (draft != null && draft.trim().isEmpty()) draft = null;

        hint = findViewById(R.id.scriptsHint);
        empty = findViewById(R.id.scriptsEmpty);
        hint.setText(pick ? R.string.scripts_hint_pick : R.string.scripts_hint_edit);

        adapter = new ScriptAdapter();
        ListView list = findViewById(R.id.scriptList);
        list.setAdapter(adapter);
        list.setOnItemClickListener((parent, view, position, id) -> {
            if (position < 0 || position >= scripts.size()) return;
            SavedScript s = scripts.get(position);
            if (pick) pickScript(s);
            else openEditor(s.id, null);
        });
        list.setOnItemLongClickListener((parent, view, position, id) -> {
            if (position < 0 || position >= scripts.size()) return true;
            openEditor(scripts.get(position).id, null);
            return true;
        });

        findViewById(R.id.btnScriptsBack).setOnClickListener(v -> finish());
        findViewById(R.id.btnScriptNew).setOnClickListener(v -> openEditor(null, draft));
        findViewById(R.id.btnScriptExamples).setOnClickListener(v -> {
            store.restoreExamples();
            reload();
            Toast.makeText(this, R.string.script_examples_ok, Toast.LENGTH_SHORT).show();
        });
    }

    @Override
    protected void onResume() {
        super.onResume();
        reload();
    }

    private void reload() {
        scripts.clear();
        scripts.addAll(store.all());
        adapter.notifyDataSetChanged();
        empty.setVisibility(scripts.isEmpty() ? View.VISIBLE : View.GONE);
    }

    private void openEditor(String id, String prefillBody) {
        Intent i = new Intent(this, ScriptEditorActivity.class);
        if (id != null) i.putExtra(ScriptEditorActivity.EXTRA_ID, id);
        if (prefillBody != null && !prefillBody.trim().isEmpty()) {
            i.putExtra(ScriptEditorActivity.EXTRA_PREFILL_BODY, prefillBody);
        }
        startActivity(i);
    }

    private void pickScript(SavedScript s) {
        if (s == null) return;
        List<String> names = ScriptVars.names(s.body);
        if (names.isEmpty()) {
            returnBody(s.body);
            return;
        }
        View form = getLayoutInflater().inflate(R.layout.dialog_script_vars, null);
        LinearLayout box = form.findViewById(R.id.varsBox);
        Map<String, EditText> fields = new LinkedHashMap<>();
        float d = getResources().getDisplayMetrics().density;
        int pad = (int) (10 * d);
        TextView intro = new TextView(this);
        intro.setText(getString(R.string.script_fill_intro, s.name));
        intro.setTextColor(ContextCompat.getColor(this, R.color.muted));
        intro.setPadding(0, 0, 0, pad);
        box.addView(intro);
        for (String n : names) {
            TextView lab = new TextView(this);
            lab.setText("{" + n + "}");
            lab.setTextColor(ContextCompat.getColor(this, R.color.accent));
            lab.setTextSize(12f);
            lab.setPadding(0, pad / 2, 0, 4);
            EditText ed = new EditText(this);
            ed.setHint(hintFor(n));
            ed.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS);
            ed.setTextColor(ContextCompat.getColor(this, R.color.text));
            ed.setHintTextColor(ContextCompat.getColor(this, R.color.muted));
            ed.setBackgroundResource(R.drawable.bg_input);
            ed.setPadding(pad, pad, pad, pad);
            ed.setSingleLine(true);
            box.addView(lab);
            box.addView(ed);
            fields.put(n, ed);
        }
        new AlertDialog.Builder(this)
                .setView(form)
                .setNegativeButton(R.string.privacy_back, null)
                .setPositiveButton(R.string.script_use, (dialog, which) -> {
                    Map<String, String> values = new LinkedHashMap<>();
                    for (Map.Entry<String, EditText> e : fields.entrySet()) {
                        values.put(e.getKey(), e.getValue().getText().toString().trim());
                    }
                    returnBody(ScriptVars.apply(s.body, values));
                })
                .show();
    }

    private static String hintFor(String name) {
        switch (name) {
            case "PON":
                return "contoh 1";
            case "ONU":
                return "contoh 1";
            case "SN":
                return "serial ONT";
            case "TYPE":
                return "ZTE-F601";
            case "NAMA":
                return "nama pelanggan";
            case "VLAN":
                return "contoh 100";
            default:
                return name.toLowerCase();
        }
    }

    private void returnBody(String body) {
        Intent data = new Intent();
        data.putExtra(EXTRA_BODY, body == null ? "" : body);
        setResult(RESULT_OK, data);
        finish();
    }

    private final class ScriptAdapter extends BaseAdapter {
        @Override
        public int getCount() {
            return scripts.size();
        }

        @Override
        public SavedScript getItem(int position) {
            return scripts.get(position);
        }

        @Override
        public long getItemId(int position) {
            return position;
        }

        @Override
        public View getView(int position, View convertView, ViewGroup parent) {
            View v = convertView;
            if (v == null) {
                v = LayoutInflater.from(parent.getContext())
                        .inflate(R.layout.item_script, parent, false);
            }
            SavedScript s = scripts.get(position);
            ((TextView) v.findViewById(R.id.scriptTitle)).setText(s.name);
            String meta = s.lineCount() + " baris";
            if (s.builtin) meta = "contoh · " + meta;
            List<String> vars = ScriptVars.names(s.body);
            if (!vars.isEmpty()) meta += " · " + vars.size() + " isian";
            ((TextView) v.findViewById(R.id.scriptMeta)).setText(meta);
            TextView note = v.findViewById(R.id.scriptNote);
            if (s.note == null || s.note.trim().isEmpty()) {
                note.setVisibility(View.GONE);
            } else {
                note.setVisibility(View.VISIBLE);
                note.setText(s.note.trim());
            }
            return v;
        }
    }
}
