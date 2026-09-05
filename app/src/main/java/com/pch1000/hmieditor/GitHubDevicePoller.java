package com.pch1000.hmieditor;

import java.net.UnknownHostException;
import java.net.SocketTimeoutException;
import java.net.SocketException;
import java.util.function.BooleanSupplier;
import java.util.function.Consumer;

/** Network-independent device-flow loop; the Android service supplies HTTP and storage. */
final class GitHubDevicePoller {
    interface Transport { Reply poll() throws Exception; }
    interface Clock {
        long now();
        void sleep(long millis) throws InterruptedException;
    }
    static final class Reply {
        final int status;
        final String token, error, message;
        final long retryAfterMillis;
        Reply(int status, String token, String error, String message, long retryAfterMillis) {
            this.status = status; this.token = token; this.error = error;
            this.message = message; this.retryAfterMillis = retryAfterMillis;
        }
    }

    static String awaitToken(Transport transport, Clock clock, BooleanSupplier active,
                             Consumer<String> progress, int intervalSeconds, int expiresSeconds) throws Exception {
        long interval = Math.max(5L, intervalSeconds) * 1000L;
        long retry = interval;
        long deadline = clock.now() + Math.max(1L, expiresSeconds) * 1000L;
        while (active.getAsBoolean()) {
            long remaining = deadline - clock.now();
            if (remaining <= 0) break;
            clock.sleep(Math.min(retry, remaining));
            if (!active.getAsBoolean() || clock.now() >= deadline) break;
            Reply result;
            try { result = transport.poll(); }
            catch (UnknownHostException | SocketTimeoutException | SocketException error) {
                retry = Math.max(interval, Math.min(60000L, retry * 2));
                progress.accept("Нет связи с GitHub. Если вход на сайте уже подтверждён, код повторять не нужно. Ожидаю сеть и повторяю запрос…");
                continue;
            }
            if (!active.getAsBoolean()) break;
            if (result.status == 429 || result.status >= 500) {
                retry = Math.max(interval, Math.max(result.retryAfterMillis, Math.min(60000L, retry * 2)));
                progress.accept("GitHub временно недоступен. Повторяю запрос автоматически…");
                continue;
            }
            if (result.status < 200 || result.status >= 300)
                throw new IllegalStateException("GitHub: HTTP " + result.status + ". Попробуй войти снова.");
            if (!result.token.isEmpty()) return result.token;
            if ("authorization_pending".equals(result.error)) {
                retry = interval;
                progress.accept("Ожидаю подтверждение на сайте GitHub…");
                continue;
            }
            if ("slow_down".equals(result.error)) {
                interval += 5000L;
                retry = Math.max(interval, retry);
                continue;
            }
            throw new IllegalStateException(result.message.isEmpty() ? "Не удалось завершить вход в GitHub" : result.message);
        }
        throw new IllegalStateException(!active.getAsBoolean() ? "Вход отменён"
                : "Время кода истекло. Нажми «Войти через GitHub» для нового кода.");
    }
}
