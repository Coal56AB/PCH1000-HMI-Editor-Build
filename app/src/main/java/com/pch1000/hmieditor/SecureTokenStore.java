package com.pch1000.hmieditor;

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

final class SecureTokenStore {
    private static final String ALIAS = "pch1000_github_token";
    private static final String VALUE = "github_token";
    private final SharedPreferences preferences;

    SecureTokenStore(Context context) {
        preferences = context.getSharedPreferences("secure_settings", Context.MODE_PRIVATE);
    }

    synchronized void put(String token) throws Exception {
        if (token == null || token.trim().isEmpty()) {
            clear();
            return;
        }
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, key());
        byte[] encrypted = cipher.doFinal(token.trim().getBytes(StandardCharsets.UTF_8));
        String packed = Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP) + "."
                + Base64.encodeToString(encrypted, Base64.NO_WRAP);
        preferences.edit().putString(VALUE, packed).apply();
    }

    synchronized String get() throws Exception {
        String packed = preferences.getString(VALUE, "");
        if (packed == null || packed.isEmpty()) return "";
        String[] parts = packed.split("\\.", 2);
        if (parts.length != 2) return "";
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128,
                Base64.decode(parts[0], Base64.NO_WRAP)));
        return new String(cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)),
                StandardCharsets.UTF_8);
    }

    synchronized boolean has() {
        try {
            return !get().isEmpty();
        } catch (Exception error) {
            clear();
            return false;
        }
    }

    synchronized void clear() {
        preferences.edit().remove(VALUE).apply();
    }

    private SecretKey key() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        if (store.containsAlias(ALIAS)) return (SecretKey) store.getKey(ALIAS, null);
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,
                "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .build());
        return generator.generateKey();
    }
}
