package id.fiberix.zteshell;

import android.view.View;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

/** Padding system bar + IME — wajib di targetSdk 35+ (edge-to-edge). */
final class InsetFit {
    static void apply(View root) {
        if (root == null) return;
        ViewCompat.setOnApplyWindowInsetsListener(root, (v, insets) -> {
            Insets sys = insets.getInsets(
                    WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
            v.setPadding(sys.left, sys.top, sys.right, Math.max(sys.bottom, ime.bottom));
            return insets;
        });
        ViewCompat.requestApplyInsets(root);
    }
}
