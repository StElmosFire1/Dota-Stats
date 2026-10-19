package opendota;

import com.sun.net.httpserver.HttpServer;
import com.google.gson.JsonParser;
import java.io.ByteArrayOutputStream;
import java.io.PrintStream;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;

/**
 * Dependency-free HTTP regression harness. Run via the community Node test:
 * node --test community-edition/tests/replayParserFailure.test.js
 */
public class ReplayHttpContractTest {
    private static final HttpClient CLIENT = HttpClient.newHttpClient();

    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }

    private static HttpResponse<String> post(HttpServer server, String path, byte[] body) throws Exception {
        return CLIENT.send(HttpRequest.newBuilder(
                URI.create("http://127.0.0.1:" + server.getAddress().getPort() + path))
                .POST(HttpRequest.BodyPublishers.ofByteArray(body)).build(), HttpResponse.BodyHandlers.ofString());
    }

    public static void main(String[] args) throws Exception {
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/real", new Main.MyHandler());
        String events = "{\"type\":\"epilogue\",\"key\":\"{}\"}\n";
        server.createContext("/success", new Main.MyHandler((input, output, blob) -> {
            output.write((blob ? "{\"players\":[]}" : events).getBytes(StandardCharsets.UTF_8));
            return true;
        }));
        server.createContext("/partial", new Main.MyHandler((input, output, blob) -> {
            output.write("PARTIAL_EVENT_MUST_NOT_LEAK\n".getBytes(StandardCharsets.UTF_8));
            throw new IllegalStateException("private-decoder-diagnostic");
        }));
        server.createContext("/missing-end", new Main.MyHandler((input, output, blob) -> {
            output.write("{\"type\":\"interval\"}\n".getBytes(StandardCharsets.UTF_8));
            return false;
        }));
        server.start();
        PrintStream original = System.err;
        ByteArrayOutputStream diagnostics = new ByteArrayOutputStream();
        System.setErr(new PrintStream(diagnostics, true, StandardCharsets.UTF_8));
        try {
            // Large unread body catches the original send-failure / connection-reset bug.
            byte[] invalid = new byte[4 * 1024 * 1024];
            Arrays.fill(invalid, (byte) 'x');
            for (byte[] input : new byte[][] {
                    new byte[0], "not-a-replay".getBytes(StandardCharsets.UTF_8),
                    "PBDEMS2\0".getBytes(StandardCharsets.UTF_8), invalid }) {
                assertFailure(post(server, "/real?strict=1", input));
            }
            assertFailure(post(server, "/partial?strict=1", invalid));
            assertFailure(post(server, "/missing-end?strict=1", invalid));
            HttpResponse<String> success = post(server, "/success?strict=1", invalid);
            check(success.statusCode() == 200, "success status");
            check(success.body().equals(events), "success NDJSON unchanged");
            check(success.headers().firstValue("X-Replay-Parse-Complete").orElse("").equals("1"),
                    "completion header");
            // Other callers keep the same success body, including bare ?blob.
            check(post(server, "/success", new byte[0]).body().equals(events), "legacy success unchanged");
            check(post(server, "/success?blob", new byte[0]).body().equals("{\"players\":[]}"), "blob unchanged");
            check(post(server, "/missing-end", new byte[0]).statusCode() == 200, "strict is opt-in");
            String logs = diagnostics.toString(StandardCharsets.UTF_8);
            check(logs.contains("private-decoder-diagnostic"), "decoder details retained in logs");
            check(logs.contains("IllegalStateException"), "exception type retained");
            check(logs.contains("at opendota."), "stack trace retained");
            check(logs.contains("requestId="), "correlation ID retained");
            System.out.println("Replay HTTP contract passed (malformed, truncated, large, partial, success, legacy/blob)");
        } finally {
            System.setErr(original);
            server.stop(0);
        }
    }

    private static void assertFailure(HttpResponse<String> response) {
        check(response.statusCode() == 422, "decode failure must be HTTP 422");
        check(response.headers().firstValue("Content-Type").orElse("").contains("application/json"), "JSON error");
        check(response.headers().firstValue("X-Replay-Parse-Complete").isEmpty(), "no success marker");
        check(!response.body().contains("PARTIAL_EVENT"), "no partial output");
        check(!response.body().contains("private-decoder-diagnostic"), "no diagnostics exposed");
        var json = JsonParser.parseString(response.body()).getAsJsonObject();
        check(!json.get("ok").getAsBoolean(), "explicit failure");
        var error = json.getAsJsonObject("error");
        check(error.get("code").getAsString().equals("REPLAY_DECODE_FAILED"), "stable code");
        check(!error.get("requestId").getAsString().isEmpty(), "request correlation");
        check(error.get("message").getAsString().contains("Re-download"), "actionable message");
    }
}
