package com.pch1000.hmieditor;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.webkit.WebView;
import android.widget.Toast;

import androidx.core.content.FileProvider;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.ProtocolException;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

final class GitHubService {
    private final Activity activity;
    private final WebView webView;
    private final SecureTokenStore tokens;
    private volatile File pendingApk;

    GitHubService(Activity activity, WebView webView) {
        this.activity = activity;
        this.webView = webView;
        this.tokens = new SecureTokenStore(activity);
    }

    boolean hasToken() {
        return tokens.has();
    }

    void setToken(String token) {
        try {
            tokens.put(token);
        } catch (Exception error) {
            throw new IllegalStateException("Не удалось защитить токен", error);
        }
    }

    void clearToken() {
        tokens.clear();
    }

    void request(String requestId, String method, String path, String jsonBody) {
        new Thread(() -> {
            try {
                if (path == null || !path.startsWith("/") || path.startsWith("//")) {
                    throw new IllegalArgumentException("Недопустимый путь GitHub API");
                }
                HttpResult result = http("https://api.github.com" + path, method, jsonBody,
                        "application/vnd.github+json", true);
                githubResult(requestId, result.status, result.body);
            } catch (Exception error) {
                githubResult(requestId, 599, jsonError(error.getMessage()));
            }
        }, "github-api").start();
    }

    void startDeviceFlow(String requestId, String clientId) {
        new Thread(() -> {
            try {
                String form = "client_id=" + URLEncoder.encode(clientId, "UTF-8")
                        + "&scope=" + URLEncoder.encode("repo workflow read:user", "UTF-8");
                HttpResult result = http("https://github.com/login/device/code", "POST", form,
                        "application/json", false, "application/x-www-form-urlencoded");
                nativeResult(requestId, result.status >= 200 && result.status < 300,
                        result.body);
            } catch (Exception error) {
                nativeResult(requestId, false, error.getMessage());
            }
        }, "github-device-start").start();
    }

    void pollDeviceFlow(String requestId, String clientId, String deviceCode,
                        int intervalSeconds, int expiresSeconds) {
        new Thread(() -> {
            int wait = Math.max(5, intervalSeconds);
            long deadline = System.currentTimeMillis() + Math.max(60, expiresSeconds) * 1000L;
            try {
                while (System.currentTimeMillis() < deadline) {
                    Thread.sleep(wait * 1000L);
                    String form = "client_id=" + URLEncoder.encode(clientId, "UTF-8")
                            + "&device_code=" + URLEncoder.encode(deviceCode, "UTF-8")
                            + "&grant_type=urn:ietf:params:oauth:grant-type:device_code";
                    HttpResult result = http("https://github.com/login/oauth/access_token", "POST",
                            form, "application/json", false, "application/x-www-form-urlencoded");
                    JSONObject value = new JSONObject(result.body);
                    String token = value.optString("access_token", "");
                    if (!token.isEmpty()) {
                        tokens.put(token);
                        nativeResult(requestId, true, "{\"authorized\":true}");
                        return;
                    }
                    String error = value.optString("error", "");
                    if ("authorization_pending".equals(error)) continue;
                    if ("slow_down".equals(error)) {
                        wait += 5;
                        continue;
                    }
                    throw new IllegalStateException(value.optString("error_description", error));
                }
                throw new IllegalStateException("Время подтверждения GitHub истекло");
            } catch (Exception error) {
                nativeResult(requestId, false, error.getMessage());
            }
        }, "github-device-poll").start();
    }

    void openExternal(String url) {
        if (url == null || !(url.startsWith("https://github.com/") || url.startsWith("https://api.github.com/"))) {
            return;
        }
        activity.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
    }

    void downloadAndInstall(String url, String suggestedName) {
        new Thread(() -> {
            try {
                if (url == null || !url.startsWith("https://")) throw new IllegalArgumentException("Неверная ссылка APK");
                File directory = new File(activity.getCacheDir(), "updates");
                if (!directory.exists() && !directory.mkdirs()) throw new IllegalStateException("Не удалось создать папку обновления");
                String cleanName = suggestedName == null ? "PCH1000-HMI-Editor-update.apk"
                        : suggestedName.replaceAll("[^A-Za-z0-9._-]", "_");
                if (!cleanName.endsWith(".apk")) cleanName += ".apk";
                File target = new File(directory, cleanName);
                HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
                connection.setInstanceFollowRedirects(true);
                connection.setRequestProperty("User-Agent", "PCH1000-HMI-Editor");
                String token = tokens.get();
                if (!token.isEmpty() && url.contains("github")) connection.setRequestProperty("Authorization", "Bearer " + token);
                int status = connection.getResponseCode();
                if (status < 200 || status >= 300) throw new IllegalStateException("Скачивание APK: HTTP " + status);
                try (InputStream in = connection.getInputStream(); OutputStream out = new FileOutputStream(target)) {
                    byte[] buffer = new byte[32768];
                    int read;
                    while ((read = in.read(buffer)) >= 0) out.write(buffer, 0, read);
                } finally {
                    connection.disconnect();
                }
                pendingApk = target;
                activity.runOnUiThread(this::installPendingApk);
            } catch (Exception error) {
                toast("Не удалось скачать обновление: " + error.getMessage());
            }
        }, "apk-update").start();
    }

    void onResume() {
        if (pendingApk != null) installPendingApk();
    }

    private void installPendingApk() {
        File apk = pendingApk;
        if (apk == null || !apk.isFile()) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                && !activity.getPackageManager().canRequestPackageInstalls()) {
            toast("Разреши установку обновлений для этого приложения");
            Intent permission = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + activity.getPackageName()));
            activity.startActivity(permission);
            return;
        }
        Uri uri = FileProvider.getUriForFile(activity,
                activity.getPackageName() + ".files", apk);
        Intent install = new Intent(Intent.ACTION_VIEW);
        install.setDataAndType(uri, "application/vnd.android.package-archive");
        install.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        activity.startActivity(install);
        pendingApk = null;
    }

    private HttpResult http(String url, String method, String body, String accept,
                            boolean authorize) throws Exception {
        return http(url, method, body, accept, authorize, "application/json; charset=utf-8");
    }

    private HttpResult http(String url, String method, String body, String accept,
                            boolean authorize, String contentType) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        connection.setConnectTimeout(20000);
        connection.setReadTimeout(45000);
        try {
            connection.setRequestMethod(method);
        } catch (ProtocolException unsupported) {
            if (!"PATCH".equals(method)) throw unsupported;
            connection.setRequestMethod("POST");
            connection.setRequestProperty("X-HTTP-Method-Override", "PATCH");
        }
        connection.setRequestProperty("Accept", accept);
        connection.setRequestProperty("Content-Type", contentType);
        connection.setRequestProperty("User-Agent", "PCH1000-HMI-Editor");
        connection.setRequestProperty("X-GitHub-Api-Version", "2022-11-28");
        if (authorize) {
            String token = tokens.get();
            if (token.isEmpty()) throw new IllegalStateException("GitHub не авторизован");
            connection.setRequestProperty("Authorization", "Bearer " + token);
        }
        if (body != null && !body.isEmpty() && !("GET".equals(method) || "HEAD".equals(method))) {
            connection.setDoOutput(true);
            try (OutputStream out = connection.getOutputStream()) {
                out.write(body.getBytes(StandardCharsets.UTF_8));
            }
        }
        int status = connection.getResponseCode();
        InputStream stream = status >= 200 && status < 400
                ? connection.getInputStream() : connection.getErrorStream();
        String result = stream == null ? "" : new String(readAll(stream), StandardCharsets.UTF_8);
        connection.disconnect();
        return new HttpResult(status, result);
    }

    private static byte[] readAll(InputStream in) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int read;
        while ((read = in.read(buffer)) >= 0) out.write(buffer, 0, read);
        return out.toByteArray();
    }

    private void githubResult(String id, int status, String body) {
        evaluate("window.AppShell&&window.AppShell.githubResult(" + JSONObject.quote(id) + ","
                + status + "," + JSONObject.quote(body == null ? "" : body) + ")");
    }

    private void nativeResult(String id, boolean ok, String body) {
        evaluate("window.AppShell&&window.AppShell.nativeResult(" + JSONObject.quote(id) + ","
                + ok + "," + JSONObject.quote(body == null ? "" : body) + ")");
    }

    private void evaluate(String script) {
        activity.runOnUiThread(() -> webView.evaluateJavascript(script, null));
    }

    private void toast(String text) {
        activity.runOnUiThread(() -> Toast.makeText(activity, text, Toast.LENGTH_LONG).show());
    }

    private static String jsonError(String text) {
        try {
            return new JSONObject().put("message", text == null ? "Ошибка GitHub" : text).toString();
        } catch (Exception ignored) {
            return "{\"message\":\"Ошибка GitHub\"}";
        }
    }

    private static final class HttpResult {
        final int status;
        final String body;
        HttpResult(int status, String body) {
            this.status = status;
            this.body = body;
        }
    }
}
