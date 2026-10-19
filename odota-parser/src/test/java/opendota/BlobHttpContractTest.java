package opendota;

import com.google.gson.JsonParser;
import com.sun.net.httpserver.HttpServer;
import java.io.ByteArrayOutputStream;
import java.io.PrintStream;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;
import org.apache.commons.compress.compressors.bzip2.BZip2CompressorOutputStream;

/** Local HTTP upstream + real handler, with injected decoders for deterministic output/failures. */
public class BlobHttpContractTest {
    private static final HttpClient CLIENT = HttpClient.newHttpClient();
    private static final Set<String> REQUEST_IDS = new HashSet<>();
    private static final byte[] REPLAY = "fixture-replay-bytes".getBytes(StandardCharsets.UTF_8);
    private static final String BLOB = "{\"players\":[],\"match_id\":123}\n";

    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }

    private static byte[] compress(byte[] input) throws Exception {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        try (var compressed = new BZip2CompressorOutputStream(output)) {
            compressed.write(input);
        }
        return output.toByteArray();
    }

    private static void serve(HttpServer server, String path, int status, byte[] body) {
        server.createContext(path, exchange -> {
            exchange.sendResponseHeaders(status, body.length);
            try (var output = exchange.getResponseBody()) {
                output.write(body);
            }
        });
    }

    private static HttpResponse<String> get(String url) throws Exception {
        return CLIENT.send(HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofSeconds(5)).GET().build(),
                HttpResponse.BodyHandlers.ofString());
    }

    private static String replayQuery(String url) {
        return "?replay_url=" + URLEncoder.encode(url, StandardCharsets.UTF_8);
    }

    private static void failure(HttpResponse<String> response, int status, String code,
            ByteArrayOutputStream diagnostics) {
        check(response.statusCode() == status, code + ": unexpected HTTP " + response.statusCode());
        check(response.headers().firstValue("Content-Type").orElse("").equals("application/json; charset=utf-8"),
                "JSON content type");
        check(response.headers().firstValue("Content-Length").orElse("").equals(
                String.valueOf(response.body().getBytes(StandardCharsets.UTF_8).length)), "fixed error length");
        check(response.headers().firstValue("X-Replay-Parse-Complete").isEmpty(), "no upload success marker");
        var json = JsonParser.parseString(response.body()).getAsJsonObject();
        check(!json.get("ok").getAsBoolean(), "explicit failure");
        var error = json.getAsJsonObject("error");
        check(error.get("code").getAsString().equals(code), "stable code");
        check(error.keySet().equals(Set.of("code", "message", "requestId")), "only public error fields");
        check(!error.get("message").getAsString().isBlank(), "actionable public message");
        String requestId = error.get("requestId").getAsString();
        UUID.fromString(requestId);
        check(REQUEST_IDS.add(requestId), "unique request IDs");
        check(diagnostics.toString(StandardCharsets.UTF_8).contains("requestId=" + requestId + " code=" + code),
                "matching request ID and failure code in logs");
        check(!response.body().contains("PRIVATE_") && !response.body().contains("opendota.")
                && !response.body().contains("Exception") && !response.body().contains("127.0.0.1"),
                "no upstream/decoder/URL diagnostics or partial output in response");
    }

    public static void main(String[] args) throws Exception {
        HttpServer upstream = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        HttpServer parser = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        var upstreamExecutor = Executors.newCachedThreadPool();
        upstream.setExecutor(upstreamExecutor);
        PrintStream original = System.err;
        ByteArrayOutputStream diagnostics = new ByteArrayOutputStream();
        AtomicInteger decodes = new AtomicInteger();
        try {
            byte[] compressed = compress(REPLAY);
            serve(upstream, "/plain.dem", 200, REPLAY);
            serve(upstream, "/valid.dem.bz2", 200, compressed);
            ByteArrayOutputStream concatenated = new ByteArrayOutputStream();
            concatenated.write(compress(Arrays.copyOfRange(REPLAY, 0, 5)));
            concatenated.write(compress(Arrays.copyOfRange(REPLAY, 5, REPLAY.length)));
            serve(upstream, "/concatenated.dem.bz2", 200, concatenated.toByteArray());
            serve(upstream, "/malformed.dem.bz2", 200, "PRIVATE_not_bzip2".getBytes(StandardCharsets.UTF_8));
            serve(upstream, "/empty.dem.bz2", 200, new byte[0]);
            serve(upstream, "/truncated.dem.bz2", 200, Arrays.copyOf(compressed, compressed.length - 8));
            byte[] corrupt = compressed.clone();
            corrupt[10] ^= 1; // first block's CRC, preserving a valid bzip2 header
            serve(upstream, "/corrupt.dem.bz2", 200, corrupt);
            for (int status : new int[] { 302, 404, 500, 503 }) {
                serve(upstream, "/status-" + status + ".dem.bz2", status,
                        "PRIVATE_upstream_diagnostic".getBytes(StandardCharsets.UTF_8));
            }
            upstream.createContext("/slow", exchange -> {
                try {
                    Thread.sleep(500);
                    exchange.sendResponseHeaders(200, -1);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                } finally {
                    exchange.close();
                }
            });
            parser.createContext("/blob", new Main.BlobHandler((input, output, blob) -> {
                decodes.incrementAndGet();
                check(blob, "blob mode passed to decoder");
                check(Arrays.equals(input.readAllBytes(), REPLAY), "decompressed bytes unchanged");
                output.write(BLOB.getBytes(StandardCharsets.UTF_8));
                return false; // preserve non-strict legacy epilogue behavior
            }, Duration.ofSeconds(5)));
            parser.createContext("/partial", new Main.BlobHandler((input, output, blob) -> {
                output.write("PRIVATE_partial_blob".getBytes(StandardCharsets.UTF_8));
                throw new IllegalStateException("PRIVATE_decoder_diagnostic");
            }, Duration.ofSeconds(5)));
            parser.createContext("/real", new Main.BlobHandler());
            parser.createContext("/timeout", new Main.BlobHandler((input, output, blob) -> {
                throw new AssertionError("timeout must never reach decoder");
            }, Duration.ofMillis(100)));
            upstream.start();
            parser.start();
            System.setErr(new PrintStream(diagnostics, true, StandardCharsets.UTF_8));
            String origin = "http://127.0.0.1:" + upstream.getAddress().getPort();
            String base = "http://127.0.0.1:" + parser.getAddress().getPort();
            for (String invalid : new String[] { "", "?replay_url=", replayQuery("file:///tmp/private"),
                    replayQuery("relative.dem"), replayQuery("http://"), replayQuery("http://[") }) {
                failure(get(base + "/blob" + invalid), 400, "REPLAY_URL_INVALID", diagnostics);
            }
            for (String path : new String[] { "/empty.dem.bz2", "/malformed.dem.bz2",
                    "/truncated.dem.bz2", "/corrupt.dem.bz2" }) {
                failure(get(base + "/blob" + replayQuery(origin + path)), 422, "REPLAY_DECOMPRESSION_FAILED",
                        diagnostics);
            }
            for (int status : new int[] { 302, 404, 500, 503 }) {
                failure(get(base + "/blob" + replayQuery(origin + "/status-" + status + ".dem.bz2")),
                        502, "REPLAY_FETCH_FAILED", diagnostics);
            }
            int unusedPort;
            try (ServerSocket reserved = new ServerSocket(0, 0, java.net.InetAddress.getLoopbackAddress())) {
                unusedPort = reserved.getLocalPort();
            }
            failure(get(base + "/blob" + replayQuery("http://127.0.0.1:" + unusedPort + "/replay.dem")),
                    502, "REPLAY_FETCH_FAILED", diagnostics);
            failure(get(base + "/timeout" + replayQuery(origin + "/slow")),
                    504, "REPLAY_FETCH_TIMEOUT", diagnostics);
            check(decodes.get() == 0, "fetch/decompression failures must not reach decoder");
            for (String path : new String[] { "/plain.dem", "/valid.dem.bz2" }) {
                failure(get(base + "/real" + replayQuery(origin + path)), 422, "REPLAY_DECODE_FAILED", diagnostics);
                failure(get(base + "/partial" + replayQuery(origin + path)), 422, "REPLAY_DECODE_FAILED", diagnostics);
            }
            for (String path : new String[] { "/plain.dem", "/valid.dem.bz2",
                    "/valid.dem.bz2?signature=keep%26encoded", "/concatenated.dem.bz2" }) {
                var response = get(base + "/blob" + replayQuery(origin + path));
                check(response.statusCode() == 200, "success HTTP status");
                check(response.body().equals(BLOB), "successful blob body is byte-for-byte unchanged");
                check(response.headers().firstValue("Content-Length").orElse("").equals(
                        String.valueOf(BLOB.getBytes(StandardCharsets.UTF_8).length)), "success content length");
            }
            check(decodes.get() == 4, "decoder handles each successful fetch once");
            String logs = diagnostics.toString(StandardCharsets.UTF_8);
            check(logs.contains("PRIVATE_decoder_diagnostic") && logs.contains("IllegalStateException")
                    && logs.contains("at opendota."), "full decoder diagnostic and stack trace retained");
            check(logs.contains("Replay upstream returned HTTP 404"), "upstream status retained in logs");
            check(logs.contains("CRC") && logs.contains("IOException"), "decompression diagnostic retained");
            System.out.println("Blob HTTP contract passed (URL, upstream, timeout, compression, decoder, success)");
        } finally {
            System.setErr(original);
            parser.stop(0);
            upstream.stop(0);
            upstreamExecutor.shutdownNow();
        }
    }
}
