package id.fiberix.zteshell;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * Menyimpan JSON profil dengan AES-GCM di Android Keystore.
 * Password OLT tidak lagi plaintext di SharedPreferences.
 */
final class SecurePrefs {
    private static final String ANDROID_KEYSTORE = "AndroidKeyStore";
    private static final String ALIAS = "id.fiberix.zteshell.profiles";
    private static final String PREF_PROFILES = "zte_ssh_profiles_enc";
    private static final String KEY_CT = "list_ct";
    private static final String KEY_IV = "list_iv";
    private static final String LEGACY_PREF = "zte_ssh_profiles";
    private static final String LEGACY_KEY = "list";
    private static final int GCM_TAG_BITS = 128;

    private final Context app;
    private final SharedPreferences prefs;

    SecurePrefs(Context ctx) {
        this(ctx, PREF_PROFILES, true);
    }

    SecurePrefs(Context ctx, String prefName) {
        this(ctx, prefName, false);
    }

    private SecurePrefs(Context ctx, String prefName, boolean migrateProfiles) {
        app = ctx.getApplicationContext();
        prefs = app.getSharedPreferences(prefName, Context.MODE_PRIVATE);
        if (migrateProfiles) migrateLegacy();
    }

    String load() {
        String ct = prefs.getString(KEY_CT, "");
        String iv = prefs.getString(KEY_IV, "");
        if (ct.isEmpty() || iv.isEmpty()) return "[]";
        try {
            return decrypt(ct, iv);
        } catch (Exception e) {
            return "[]";
        }
    }

    void save(String json) {
        try {
            Enc enc = encrypt(json == null ? "[]" : json);
            prefs.edit().putString(KEY_CT, enc.ct).putString(KEY_IV, enc.iv).apply();
        } catch (Exception ignored) {
        }
    }

    private void migrateLegacy() {
        if (prefs.contains(KEY_CT)) return;
        SharedPreferences old = app.getSharedPreferences(LEGACY_PREF, Context.MODE_PRIVATE);
        String raw = old.getString(LEGACY_KEY, null);
        if (raw == null || raw.isEmpty()) return;
        save(raw);
        old.edit().clear().apply();
    }

    private Enc encrypt(String plain) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, key());
        byte[] iv = cipher.getIV();
        byte[] ct = cipher.doFinal(plain.getBytes(StandardCharsets.UTF_8));
        return new Enc(b64(ct), b64(iv));
    }

    private String decrypt(String ctB64, String ivB64) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        GCMParameterSpec spec = new GCMParameterSpec(GCM_TAG_BITS, unb64(ivB64));
        cipher.init(Cipher.DECRYPT_MODE, key(), spec);
        byte[] plain = cipher.doFinal(unb64(ctB64));
        return new String(plain, StandardCharsets.UTF_8);
    }

    private SecretKey key() throws Exception {
        KeyStore ks = KeyStore.getInstance(ANDROID_KEYSTORE);
        ks.load(null);
        if (ks.containsAlias(ALIAS)) {
            KeyStore.SecretKeyEntry entry = (KeyStore.SecretKeyEntry) ks.getEntry(ALIAS, null);
            if (entry != null) return entry.getSecretKey();
        }
        KeyGenerator kg = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE);
        kg.init(new KeyGenParameterSpec.Builder(
                ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build());
        return kg.generateKey();
    }

    private static String b64(byte[] data) {
        return Base64.encodeToString(data, Base64.NO_WRAP);
    }

    private static byte[] unb64(String s) {
        return Base64.decode(s, Base64.NO_WRAP);
    }

    private static final class Enc {
        final String ct;
        final String iv;

        Enc(String ct, String iv) {
            this.ct = ct;
            this.iv = iv;
        }
    }
}
