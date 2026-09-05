package com.pch1000.hmieditor;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.provider.Settings;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.documentfile.provider.DocumentFile;

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
    private static final int EXPORT_FOLDER = 1003;
    private static final int SELECT_WORKING_FOLDER = 1004;
    private static final String PREFS = "project_settings";
    private static final String WORKING_FOLDER = "working_folder";
    private WebView webView;
    private GitHubService github;
    private byte[] pendingExport;
    private String pendingFolderExport;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        webView = new WebView(this);
        setContentView(webView);
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
        github = new GitHubService(this, webView);
        webView.addJavascriptInterface(new EditorBridge(), "AndroidEditor");
        webView.loadUrl(APP_ORIGIN + "editor/index.html");
    }

    private final class LocalAssetClient extends WebViewClient {
        @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if ("https".equals(uri.getScheme()) && "appassets.androidplatform.net".equals(uri.getHost())) {
                return false;
            }
            if (request.isForMainFrame()) {
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                } catch (Exception ignored) {
                    // Не загружаем внешнюю страницу внутрь WebView с системным мостом.
                }
            }
            return true;
        }

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

    @Override public void onBackPressed() {
        webView.evaluateJavascript("(window.AppShell&&window.AppShell.onBack())||(window.HmiEditor&&window.HmiEditor.onBack())||false", value -> {
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

        @JavascriptInterface public void saveExportFolder(String payload) {
            try {
                JSONObject root = new JSONObject(payload);
                root.getJSONArray("entries");
                pendingFolderExport = payload;
                runOnUiThread(() -> {
                    Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
                    intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION
                            | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                            | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
                            | Intent.FLAG_GRANT_PREFIX_URI_PERMISSION);
                    startActivityForResult(intent, EXPORT_FOLDER);
                });
            } catch (Exception error) {
                notifyFolderExport(false, "Не удалось подготовить файлы: " + error.getMessage());
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

        @JavascriptInterface public boolean hasGithubToken() {
            return github != null && github.hasToken();
        }

        @JavascriptInterface public void setGithubToken(String token) {
            if (github != null) github.setToken(token);
        }

        @JavascriptInterface public void clearGithubToken() {
            if (github != null) github.clearToken();
        }

        @JavascriptInterface public void githubRequest(String requestId, String method,
                                                       String path, String jsonBody) {
            if (github != null) github.request(requestId, method, path, jsonBody);
        }

        @JavascriptInterface public void checkAppUpdate(String requestId) {
            if (github != null) github.checkAppUpdate(requestId);
        }

        @JavascriptInterface public void copyGithubDeviceCode(String code) {
            if (github != null) github.copyDeviceCode(code);
        }

        @JavascriptInterface public void cancelGithubDeviceFlow() {
            if (github != null) github.cancelDeviceFlow();
        }

        @JavascriptInterface public void startGithubDeviceFlow(String requestId, String clientId) {
            if (github != null) github.startDeviceFlow(requestId, clientId);
        }

        @JavascriptInterface public void pollGithubDeviceFlow(String requestId, String clientId,
                                                              String deviceCode, int interval,
                                                              int expiresIn) {
            if (github != null) github.pollDeviceFlow(requestId, clientId, deviceCode, interval, expiresIn);
        }

        @JavascriptInterface public void openExternal(String url) {
            runOnUiThread(() -> {
                if (github != null) github.openExternal(url);
            });
        }

        @JavascriptInterface public String appInfo() {
            try {
                JSONObject value = new JSONObject();
                value.put("versionName", BuildConfig.VERSION_NAME);
                value.put("versionCode", BuildConfig.VERSION_CODE);
                value.put("githubOAuthClientId", BuildConfig.GITHUB_OAUTH_CLIENT_ID);
                return value.toString();
            } catch (Exception ignored) {
                return "{}";
            }
        }

        @JavascriptInterface public void downloadAndInstall(String url, String name) {
            if (github != null) github.downloadAndInstall(url, name);
        }

        @JavascriptInterface public void chooseWorkingFolder() {
            runOnUiThread(() -> {
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION
                        | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                        | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
                        | Intent.FLAG_GRANT_PREFIX_URI_PERMISSION);
                startActivityForResult(intent, SELECT_WORKING_FOLDER);
            });
        }

        @JavascriptInterface public String workingFolderInfo() {
            String raw = getSharedPreferences(PREFS, MODE_PRIVATE).getString(WORKING_FOLDER, "");
            if (raw == null || raw.isEmpty()) return "{}";
            try {
                Uri uri = Uri.parse(raw);
                DocumentFile folder = DocumentFile.fromTreeUri(MainActivity.this, uri);
                return new JSONObject().put("uri", raw)
                        .put("name", folder == null ? "выбранная папка" : folder.getName()).toString();
            } catch (Exception ignored) {
                return "{}";
            }
        }

        @JavascriptInterface public void saveWorkingProject(String payload) {
            String raw = getSharedPreferences(PREFS, MODE_PRIVATE).getString(WORKING_FOLDER, "");
            if (raw == null || raw.isEmpty()) {
                notifyWorkingProjectSaved(false, "Сначала выбери рабочую папку");
                return;
            }
            new Thread(() -> {
                try {
                    writeExportFolder(Uri.parse(raw), payload);
                    notifyWorkingProjectSaved(true, "Полный C-проект сохранён");
                } catch (Exception error) {
                    notifyWorkingProjectSaved(false, "Ошибка записи: " + error.getMessage());
                }
            }, "hmi-working-save").start();
        }

        @JavascriptInterface public void autoSaveProject(String projectJson) {
            String raw = getSharedPreferences(PREFS, MODE_PRIVATE).getString(WORKING_FOLDER, "");
            if (raw == null || raw.isEmpty()) return;
            new Thread(() -> {
                try {
                    DocumentFile root = DocumentFile.fromTreeUri(MainActivity.this, Uri.parse(raw));
                    if (root != null && root.isDirectory() && root.canWrite()) {
                        writeTextFile(root, "PCH1000_HMI_editor_project.json", projectJson);
                    }
                } catch (Exception ignored) {
                    // Полный экспорт покажет ошибку явно; фоновое сохранение не мешает редактированию.
                }
            }, "hmi-project-autosave").start();
        }
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (resultCode != RESULT_OK || data == null || data.getData() == null) {
            if (requestCode == CREATE_EXPORT && webView != null) {
                pendingExport = null;
                webView.evaluateJavascript("window.HmiEditor && window.HmiEditor.exportFinished(false)", null);
            } else if (requestCode == EXPORT_FOLDER) {
                pendingFolderExport = null;
                notifyFolderExport(false, "Экспорт отменён");
            } else if (requestCode == SELECT_WORKING_FOLDER) {
                notifyWorkingFolder(false, "", "");
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
            } else if (requestCode == EXPORT_FOLDER) {
                final String payload = pendingFolderExport;
                pendingFolderExport = null;
                if (payload == null) throw new IllegalStateException("Нет подготовленных файлов");
                int flags = data.getFlags() & (Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
                try {
                    getContentResolver().takePersistableUriPermission(uri, flags);
                } catch (SecurityException ignored) {
                    // Некоторые файловые провайдеры дают доступ только на время текущей операции.
                }
                new Thread(() -> {
                    try {
                        writeExportFolder(uri, payload);
                        notifyFolderExport(true, "C-проект сохранён в выбранную папку");
                    } catch (Exception error) {
                        notifyFolderExport(false, "Ошибка записи: " + error.getMessage());
                    }
                }, "hmi-folder-export").start();
            } else if (requestCode == OPEN_PROJECT) {
                byte[] opened;
                try (InputStream in = getContentResolver().openInputStream(uri)) {
                    if (in == null) throw new IllegalStateException("Файл недоступен для чтения");
                    opened = readAll(in);
                }
                String json = projectJson(opened);
                String quoted = JSONObject.quote(json);
                webView.evaluateJavascript("window.HmiEditor.importProject(" + quoted + ")", null);
            } else if (requestCode == SELECT_WORKING_FOLDER) {
                int flags = data.getFlags() & (Intent.FLAG_GRANT_READ_URI_PERMISSION
                        | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
                try {
                    getContentResolver().takePersistableUriPermission(uri, flags);
                } catch (SecurityException ignored) {
                    // Некоторые файловые провайдеры не дают постоянное разрешение.
                }
                getSharedPreferences(PREFS, MODE_PRIVATE).edit()
                        .putString(WORKING_FOLDER, uri.toString()).apply();
                DocumentFile root = DocumentFile.fromTreeUri(this, uri);
                DocumentFile project = root == null ? null : root.findFile("PCH1000_HMI_editor_project.json");
                String json = "";
                if (project != null && project.isFile()) {
                    try (InputStream in = getContentResolver().openInputStream(project.getUri())) {
                        if (in != null) json = new String(readAll(in), StandardCharsets.UTF_8);
                    }
                }
                notifyWorkingFolder(!json.isEmpty(), json, root == null ? "выбранная папка" : root.getName());
            }
        } catch (Exception error) {
            showError(error.getMessage());
            if (requestCode == EXPORT_FOLDER) notifyFolderExport(false, "Ошибка записи: " + error.getMessage());
            else if (requestCode == SELECT_WORKING_FOLDER) notifyWorkingFolder(false, "", "");
            else webView.evaluateJavascript("window.HmiEditor && window.HmiEditor.exportFinished(false)", null);
        }
    }

    private void writeExportFolder(Uri treeUri, String payload) throws Exception {
        DocumentFile root = DocumentFile.fromTreeUri(this, treeUri);
        if (root == null || !root.isDirectory() || !root.canWrite()) {
            throw new IllegalStateException("Выбранная папка недоступна для записи");
        }
        JSONArray entries = new JSONObject(payload).getJSONArray("entries");
        for (int i = 0; i < entries.length(); i++) {
            JSONObject item = entries.getJSONObject(i);
            String path = safePath(item.getString("path"));
            String[] parts = path.split("/");
            if (parts.length == 0) throw new IllegalArgumentException("Пустой путь файла");
            DocumentFile directory = root;
            for (int part = 0; part < parts.length - 1; part++) {
                if (parts[part].isEmpty()) throw new IllegalArgumentException("Недопустимый путь файла");
                DocumentFile child = directory.findFile(parts[part]);
                if (child == null) child = directory.createDirectory(parts[part]);
                if (child == null || !child.isDirectory()) {
                    throw new IllegalStateException("Не удалось создать папку " + parts[part]);
                }
                directory = child;
            }
            String name = parts[parts.length - 1];
            if (name.isEmpty()) throw new IllegalArgumentException("Пустое имя файла");
            DocumentFile file = directory.findFile(name);
            if (file != null && file.isDirectory()) {
                throw new IllegalStateException(name + " уже существует как папка");
            }
            if (file == null) file = directory.createFile(exportMime(name), name);
            if (file == null) throw new IllegalStateException("Не удалось создать " + name);
            try (OutputStream out = getContentResolver().openOutputStream(file.getUri(), "wt")) {
                if (out == null) throw new IllegalStateException("Файл " + name + " недоступен для записи");
                out.write(item.getString("content").getBytes(StandardCharsets.UTF_8));
            }
        }
    }

    private static String exportMime(String name) {
        // Двоичный MIME не даёт файловому провайдеру самовольно дописать .txt к .c/.h/Makefile.
        return "application/octet-stream";
    }

    private void writeTextFile(DocumentFile root, String name, String text) throws Exception {
        DocumentFile file = root.findFile(name);
        if (file == null) file = root.createFile(exportMime(name), name);
        if (file == null || !file.isFile()) throw new IllegalStateException("Не удалось создать " + name);
        try (OutputStream out = getContentResolver().openOutputStream(file.getUri(), "wt")) {
            if (out == null) throw new IllegalStateException("Файл недоступен для записи");
            out.write(text.getBytes(StandardCharsets.UTF_8));
        }
    }

    private void notifyFolderExport(boolean ok, String message) {
        runOnUiThread(() -> {
            if (webView == null) return;
            webView.evaluateJavascript("window.HmiEditor && window.HmiEditor.exportFolderFinished("
                    + ok + "," + JSONObject.quote(message == null ? "" : message) + ")", null);
        });
    }

    private void notifyWorkingFolder(boolean hasProject, String json, String name) {
        runOnUiThread(() -> {
            if (webView == null) return;
            webView.evaluateJavascript("window.AppShell&&window.AppShell.workingFolderSelected("
                    + hasProject + "," + JSONObject.quote(json == null ? "" : json) + ","
                    + JSONObject.quote(name == null ? "" : name) + ")", null);
        });
    }

    private void notifyWorkingProjectSaved(boolean ok, String message) {
        runOnUiThread(() -> {
            if (webView == null) return;
            webView.evaluateJavascript("window.AppShell&&window.AppShell.workingProjectSaved("
                    + ok + "," + JSONObject.quote(message == null ? "" : message) + ")", null);
        });
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

    @Override protected void onResume() {
        super.onResume();
        if (github != null) github.onResume();
    }

    @Override protected void onDestroy() {
        if (github != null) github.dispose();
        if (webView != null) {
            webView.removeJavascriptInterface("AndroidEditor");
            webView.destroy();
            webView = null;
        }
        github = null;
        super.onDestroy();
    }
}
