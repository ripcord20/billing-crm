package id.fiberix.zteshell;

import android.os.Bundle;
import android.widget.TextView;

import androidx.appcompat.app.AppCompatActivity;

public class PrivacyActivity extends AppCompatActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_privacy);
        InsetFit.apply(findViewById(R.id.privacyRoot));
        TextView body = findViewById(R.id.privacyBody);
        body.setText(getString(R.string.privacy_body));
        findViewById(R.id.btnPrivacyBack).setOnClickListener(v -> finish());
    }
}
