package com.pch1000.hmieditor;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipOutputStream;

public final class MainActivity extends Activity {
    private static final String APP_ORIGIN = "https://appassets.androidplatform.net/assets/";
    private static final int CREATE_EXPORT = 1001;
    private static final int OPEN_PROJECT = 1002;
    private WebView webView;
    private byte[] pendingExport;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        webView = new WebView(this);
        setContentView(webView);
        // Some Android builds (including MIUI/HyperOS) do not create DecorView
        // until content has been attached. Calling Window#getInsetsController()
        // before that point crashes inside PhoneWindow.
        webView.post(this::enterFullscreen);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setDefaultTextEncodingName("UTF-8");
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        webView.setWebViewClient(new LocalAssetClient());
        webView.setWebChromeClient(new WebChromeClient());
        webView.addJavascriptInterface(new EditorBridge(), "AndroidEditor");
        webView.loadUrl(APP_ORIGIN + "editor/index.html");
    }

    private final class LocalAssetClient extends WebViewClient {
        @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if (!"https".equals(uri.getScheme()) || !"appassets.androidplatform.net".equals(uri.getHost())) {
                return super.shouldInterceptRequest(view, request);
            }
            String path = uri.getPath();
            if (path == null || !path.startsWith("/assets/")) return null;
            try {
                String assetPath = safePath(path.substring("/assets/".length()));
                String mime = mimeType(assetPath);
                return new WebResourceResponse(mime, "UTF-8", getAssets().open(assetPath));
            } catch (Exception ignored) {
                return null;
            }
        }
    }

    private static String mimeType(String path) {
        String lower = path.toLowerCase(java.util.Locale.ROOT);
        if (lower.endsWith(".html")) return "text/html";
        if (lower.endsWith(".css")) return "text/css";
        if (lower.endsWith(".js")) return "application/javascript";
        if (lower.endsWith(".json")) return "application/json";
        if (lower.endsWith(".png")) return "image/png";
        return "application/octet-stream";
    }

    private void enterFullscreen() {
        View decorView = getWindow().getDecorView();
        if (decorView == null) return;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            getWindow().setDecorFitsSystemWindows(false);
            android.view.WindowInsetsController controller = decorView.getWindowInsetsController();
            if (controller != null) {
                controller.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                controller.setSystemBarsBehavior(
                    android.view.WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            decorView.setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_FULLSCREEN |
                View.SYSTEM_UI_FLAG_HIDE_NAVIGATION |
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY |
                View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN |
                View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION |
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
        }
    }

    @Override public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) enterFullscreen();
    }

    @Override public void onBackPressed() {
        webView.evaluateJavascript("window.HmiEditor && window.HmiEditor.onBack()", value -> {
            if ("false".equals(value)) super.onBackPressed();
        });
    }

    public final class EditorBridge {
        @JavascriptInterface public void saveExport(String payload) {
            try {
                JSONObject root = new JSONObject(payload);
                JSONArray entries = root.getJSONArray("entries");
                ByteArrayOutputStream bytes = new ByteArrayOutputStream();
                try (ZipOutputStream zip = new ZipOutputStream(bytes, StandardCharsets.UTF_8)) {
                    for (int i = 0; i < entries.length(); i++) {
                        JSONObject item = entries.getJSONObject(i);
                        String path = safePath(item.getString("path"));
                        zip.putNextEntry(new ZipEntry(path));
                        zip.write(item.getString("content").getBytes(StandardCharsets.UTF_8));
                        zip.closeEntry();
                    }
                }
                pendingExport = bytes.toByteArray();
                runOnUiThread(() -> {
                    Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    intent.setType("application/zip");
                    intent.putExtra(Intent.EXTRA_TITLE, "PCH1000_HMI_edited.zip");
                    startActivityForResult(intent, CREATE_EXPORT);
                });
            } catch (Exception error) {
                showError("Не удалось подготовить ZIP: " + error.getMessage());
            }
        }

        @JavascriptInterface public void pickProject() {
            runOnUiThread(() -> {
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("*/*");
                intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"application/json", "application/zip", "application/octet-stream"});
                startActivityForResult(intent, OPEN_PROJECT);
            });
        }

        @JavascriptInterface public String readAsset(String path) {
            try {
                String safe = safePath(path);
                try (InputStream in = getAssets().open(safe)) {
                    return new String(readAll(in), StandardCharsets.UTF_8);
                }
            } catch (Exception error) {
                return "";
            }
        }

        @JavascriptInterface public String deviceId() {
            String id = Settings.Secure.getString(getContentResolver(), Settings.Secure.ANDROID_ID);
            return id == null ? "android" : id;
        }
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (resultCode != RESULT_OK || data == null || data.getData() == null) {
            if (requestCode == CREATE_EXPORT && webView != null) {
                pendingExport = null;
                webView.evaluateJavascript("window.HmiEditor && window.HmiEditor.exportFinished(false)", null);
            }
            return;
        }
        Uri uri = data.getData();
        try {
            if (requestCode == CREATE_EXPORT) {
                try (OutputStream out = getContentResolver().openOutputStream(uri, "w")) {
                    if (out == null) throw new IllegalStateException("Файл недоступен для записи");
                    out.write(pendingExport);
                }
                pendingExport = null;
                Toast.makeText(this, "ZIP экспортирован", Toast.LENGTH_SHORT).show();
                webView.evaluateJavascript("window.HmiEditor && window.HmiEditor.exportFinished(true)", null);
            } else if (requestCode == OPEN_PROJECT) {
                byte[] opened;
                try (InputStream in = getContentResolver().openInputStream(uri)) {
                    if (in == null) throw new IllegalStateException("Файл недоступен для чтения");
                    opened = readAll(in);
                }
                String json = projectJson(opened);
                String quoted = JSONObject.quote(json);
                webView.evaluateJavascript("window.HmiEditor.importProject(" + quoted + ")", null);
            }
        } catch (Exception error) {
            showError(error.getMessage());
            webView.evaluateJavascript("window.HmiEditor && window.HmiEditor.exportFinished(false)", null);
        }
    }

    private static String safePath(String path) {
        String clean = path.replace('\\', '/');
        if (clean.startsWith("/") || clean.contains("../") || clean.equals("..")) {
            throw new IllegalArgumentException("Недопустимый путь");
        }
        return clean;
    }

    private static byte[] readAll(InputStream in) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int read;
        while ((read = in.read(buffer)) >= 0) out.write(buffer, 0, read);
        return out.toByteArray();
    }

    private static String projectJson(byte[] opened) throws Exception {
        if (opened.length >= 2 && opened[0] == 'P' && opened[1] == 'K') {
            try (ZipInputStream zip = new ZipInputStream(new java.io.ByteArrayInputStream(opened), StandardCharsets.UTF_8)) {
                ZipEntry entry;
                while ((entry = zip.getNextEntry()) != null) {
                    if (entry.getName().endsWith("PCH1000_HMI_editor_project.json")) {
                        return new String(readAll(zip), StandardCharsets.UTF_8);
                    }
                }
            }
            throw new IllegalArgumentException("В ZIP нет проекта редактора");
        }
        return new String(opened, StandardCharsets.UTF_8);
    }

    private void showError(String text) {
        runOnUiThread(() -> Toast.makeText(this, text, Toast.LENGTH_LONG).show());
    }

    @Override protected void onDestroy() {
        if (webView != null) {
            webView.removeJavascriptInterface("AndroidEditor");
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
