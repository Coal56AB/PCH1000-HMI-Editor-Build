package com.pch1000.hmieditor;

import java.net.UnknownHostException;
import java.net.SocketTimeoutException;
import java.net.SocketException;
import javax.net.ssl.SSLHandshakeException;
import java.util.*;
import java.util.concurrent.atomic.AtomicBoolean;

public final class GitHubDevicePollerTest {
    static class Clock implements GitHubDevicePoller.Clock {
        long time; final List<Long> waits = new ArrayList<>();
        public long now() { return time; }
        public void sleep(long millis) { waits.add(millis); time += millis; }
    }
    static GitHubDevicePoller.Reply reply(int status, String token, String error, long retry) {
        return new GitHubDevicePoller.Reply(status, token, error, error, retry);
    }
    static GitHubDevicePoller.Transport sequence(Object... values) {
        Iterator<Object> it = Arrays.asList(values).iterator();
        return () -> {
            if (!it.hasNext()) throw new AssertionError("Unexpected extra poll");
            Object next = it.next();
            if (next instanceof Exception) throw (Exception) next;
            return (GitHubDevicePoller.Reply) next;
        };
    }
    static String run(GitHubDevicePoller.Transport transport, Clock clock, int expires) throws Exception {
        return GitHubDevicePoller.awaitToken(transport, clock, () -> true, ignored -> {}, 5, expires);
    }
    static void check(boolean ok) { if (!ok) throw new AssertionError(); }
    public static void main(String[] args) throws Exception {
        Clock clock = new Clock();
        check("approved".equals(run(sequence(new UnknownHostException(), new SocketTimeoutException(),
                new SocketException(), reply(200,"approved","",0)),clock,900)));
        check(clock.waits.equals(Arrays.asList(5000L,10000L,20000L,40000L)));
        clock = new Clock();
        check("approved".equals(run(sequence(reply(200,"","authorization_pending",0),
                reply(200,"","slow_down",0), reply(200,"","authorization_pending",0),
                reply(200,"approved","",0)),clock,900)));
        check(clock.waits.equals(Arrays.asList(5000L,5000L,10000L,10000L)));
        clock = new Clock();
        run(sequence(reply(503,"","",0),reply(429,"","",45000),reply(200,"approved","",0)),clock,900);
        check(clock.waits.equals(Arrays.asList(5000L,10000L,45000L)));
        clock = new Clock();
        try { run(() -> {throw new UnknownHostException();},clock,12);throw new AssertionError(); }
        catch (IllegalStateException expired) { check(expired.getMessage().contains("истекло")); }
        check(clock.time == 12000L);
        for (String error : new String[]{"access_denied","expired_token","incorrect_client_credentials"}) {
            try { run(sequence(reply(200,"",error,0)),new Clock(),900);throw new AssertionError(); }
            catch (IllegalStateException expected) { check(error.equals(expected.getMessage())); }
        }
        try { run(sequence(reply(401,"","",0)),new Clock(),900);throw new AssertionError(); }
        catch (IllegalStateException expected) { check(expected.getMessage().contains("401")); }
        try { run(sequence(new SSLHandshakeException("bad certificate")),new Clock(),900);throw new AssertionError(); }
        catch (SSLHandshakeException expected) { }
        AtomicBoolean active = new AtomicBoolean(true);
        try {
            GitHubDevicePoller.awaitToken(() -> {active.set(false);return reply(200,"late-token","",0);},
                    new Clock(),active::get,ignored -> {},5,900);
            throw new AssertionError("Cancelled login returned a token");
        } catch (IllegalStateException expected) {check(expected.getMessage().contains("отменён"));}
        System.out.println("PASS: DNS/timeout/disconnect recovery, backoff, slow_down, HTTP retry, expiry, denial, TLS error, cancellation");
    }
}
