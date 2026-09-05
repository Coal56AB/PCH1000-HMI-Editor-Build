package com.pch1000.hmieditor;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.SystemClock;
import android.content.ClipData;
import android.content.ClipboardManager;
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
import java.net.UnknownHostException;
import java.net.SocketTimeoutException;
import java.net.SocketException;
import java.util.concurrent.atomic.AtomicInteger;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

final class GitHubService {
    private static final String UPDATE_REPO = "Coal56AB/PCH1000-HMI-Editor-Build";
    private final Activity activity;
    private final WebView webView;
    private final SecureTokenStore tokens;
    private volatile File pendingApk;
    private final AtomicInteger authGeneration = new AtomicInteger();
    private volatile boolean disposed;

    GitHubService(Activity activity, WebView webView) {
        this.activity = activity;
        this.webView = webView;
        this.tokens = new SecureTokenStore(activity);
    }

    boolean hasToken() {
        return tokens.has();
    }

    void checkAppUpdate(String requestId) {
        new Thread(() -> {
            try {
                HttpResult result = http("https://api.github.com/repos/" + UPDATE_REPO
                        + "/releases/latest", "GET", null, "application/vnd.github+json", false);
                githubResult(requestId, result.status, result.body);
            } catch (Exception error) {
                githubResult(requestId, 599, jsonError(error.getMessage()));
            }
        }, "app-update-check").start();
    }

    void setToken(String token) {
        try {
            tokens.put(token);
        } catch (Exception error) {
            throw new IllegalStateException("Не удалось защитить токен", error);
        }
    }

    synchronized void clearToken() {
        cancelDeviceFlow();
        tokens.clear();
    }

    synchronized void cancelDeviceFlow() {
        authGeneration.incrementAndGet();
    }

    void dispose() {
        disposed = true;
        cancelDeviceFlow();
    }

    void copyDeviceCode(String code) {
        if (code == null || !code.matches("[A-Z0-9]{4}-[A-Z0-9]{4}")) return;
        activity.runOnUiThread(() -> {
            ClipboardManager clipboard = activity.getSystemService(ClipboardManager.class);
            if (clipboard != null) clipboard.setPrimaryClip(ClipData.newPlainText("GitHub", code));
        });
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
                        + "&scope=" + URLEncoder.encode("repo read:user", "UTF-8");
                HttpResult result = http("https://github.com/login/device/code", "POST", form,
                        "application/json", false, "application/x-www-form-urlencoded");
                JSONObject value = new JSONObject(result.body);
                if (result.status < 200 || result.status >= 300 || value.has("error")) {
                    throw new IllegalStateException(authError(value.optString("error"),
                            value.optString("error_description", "GitHub: HTTP " + result.status)));
                }
                if (!value.has("device_code") || !value.has("user_code")) {
                    throw new IllegalStateException("GitHub не выдал код входа. Попробуй ещё раз.");
                }
                nativeResult(requestId, true, result.body);
            } catch (Exception error) {
                nativeResult(requestId, false, readableError(error));
            }
        }, "github-device-start").start();
    }

    void pollDeviceFlow(String requestId, String clientId, String deviceCode,
                        int intervalSeconds, int expiresSeconds) {
        final int generation = authGeneration.incrementAndGet();
        new Thread(() -> {
            try {
                String form = "client_id=" + URLEncoder.encode(clientId, "UTF-8")
                        + "&device_code=" + URLEncoder.encode(deviceCode, "UTF-8")
                        + "&grant_type=urn:ietf:params:oauth:grant-type:device_code";
                String token = GitHubDevicePoller.awaitToken(() -> {
                    HttpResult result = http("https://github.com/login/oauth/access_token", "POST",
                            form, "application/json", false, "application/x-www-form-urlencoded");
                    // Retry HTTP 5xx even if a proxy returned HTML instead of JSON.
                    JSONObject value = result.status >= 200 && result.status < 300
                            ? new JSONObject(result.body) : new JSONObject();
                    String error = value.optString("error", "");
                    return new GitHubDevicePoller.Reply(result.status, value.optString("access_token", ""),
                            error, authError(error, value.optString("error_description", error)), result.retryAfterMillis);
                }, new GitHubDevicePoller.Clock() {
                    public long now() { return SystemClock.elapsedRealtime(); }
                    public void sleep(long millis) throws InterruptedException { Thread.sleep(millis); }
                }, () -> generation == authGeneration.get() && !disposed,
                        text -> authProgress(requestId, text), intervalSeconds, expiresSeconds);
                synchronized (this) {
                    if (generation != authGeneration.get() || disposed) throw new IllegalStateException("Вход отменён");
                    tokens.put(token);
                }
                nativeResult(requestId, true, "{\"authorized\":true}");
            } catch (Exception error) {
                nativeResult(requestId, false, readableError(error));
            }
        }, "github-device-poll").start();
    }

    private static String authError(String code, String fallback) {
        if ("access_denied".equals(code)) return "Доступ отклонён на сайте GitHub. Можно начать вход заново.";
        if ("expired_token".equals(code)) return "Код истёк. Нажми «Войти через GitHub» для нового кода.";
        if ("incorrect_client_credentials".equals(code)) return "GitHub не принял Client ID приложения.";
        if ("device_flow_disabled".equals(code)) return "В настройках OAuth-приложения GitHub нужно включить Enable Device Flow.";
        return fallback.isEmpty() ? "Не удалось завершить вход в GitHub" : fallback;
    }

    private static String readableError(Exception error) {
        if (error instanceof UnknownHostException) return "Не удалось найти адрес GitHub. Проверь интернет, VPN или частный DNS и попробуй снова.";
        if (error instanceof SocketTimeoutException || error instanceof SocketException)
            return "Соединение с GitHub прервалось. Проверь интернет и попробуй снова.";
        return error.getMessage() == null ? "Ошибка подключения к GitHub" : error.getMessage();
    }

    private void authProgress(String id, String text) {
        evaluate("window.AppShell&&window.AppShell.githubAuthProgress(" + JSONObject.quote(id)
                + "," + JSONObject.quote(text) + ")");
    }

    void openExternal(String url) {
        if (url == null || !(url.startsWith("https://github.com/") || url.startsWith("https://api.github.com/"))) {
            return;
        }
        activity.runOnUiThread(() -> {
            try { activity.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))); }
            catch (Exception error) { toast("Не удалось открыть браузер. Открой github.com/login/device вручную."); }
        });
    }

    void downloadAndInstall(String url, String suggestedName) {
        new Thread(() -> {
            try {
                if (url == null || !url.startsWith("https://github.com/" + UPDATE_REPO + "/releases/download/")) {
                    throw new IllegalArgumentException("APK должен быть из репозитория обновлений приложения");
                }
                File directory = new File(activity.getCacheDir(), "updates");
                if (!directory.exists() && !directory.mkdirs()) throw new IllegalStateException("Не удалось создать папку обновления");
                String cleanName = suggestedName == null ? "PCH1000-HMI-Editor-update.apk"
                        : suggestedName.replaceAll("[^A-Za-z0-9._-]", "_");
                if (!cleanName.endsWith(".apk")) cleanName += ".apk";
                File target = new File(directory, cleanName);
                HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
                connection.setInstanceFollowRedirects(true);
                connection.setRequestProperty("User-Agent", "PCH1000-HMI-Editor");
                // Public APK releases never receive the C-project account token.
                connection.setConnectTimeout(20000);
                connection.setReadTimeout(45000);
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
        try {
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
            String result;
            long retryAfterMillis = 0;
            try { retryAfterMillis = Math.max(0, Long.parseLong(connection.getHeaderField("Retry-After"))) * 1000L; }
            catch (Exception ignored) { }
            if (stream == null) result = "";
            else try (InputStream in = stream) { result = new String(readAll(in), StandardCharsets.UTF_8); }
            return new HttpResult(status, result, retryAfterMillis);
        } finally { connection.disconnect(); }
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
        activity.runOnUiThread(() -> { if (!disposed) webView.evaluateJavascript(script, null); });
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
        final long retryAfterMillis;
        HttpResult(int status, String body, long retryAfterMillis) {
            this.status = status;
            this.body = body;
            this.retryAfterMillis = retryAfterMillis;
        }
    }
}
