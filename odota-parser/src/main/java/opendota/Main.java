package opendota;

import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.io.UnsupportedEncodingException;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.URLDecoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Timer;
import java.util.TimerTask;
import java.util.UUID;

import org.apache.commons.compress.compressors.bzip2.BZip2CompressorInputStream;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;
import com.google.gson.JsonObject;

public class Main {
    private static final long STARTED_AT = System.currentTimeMillis();
    private static final String BUILD_SHA256 = buildSha256();

    private static String buildSha256() {
        try {
            Path jar = Path.of(Main.class.getProtectionDomain().getCodeSource().getLocation().toURI());
            if (!Files.isRegularFile(jar)) return "development-classes";
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            try (InputStream input = Files.newInputStream(jar)) {
                byte[] buffer = new byte[65536];
                int count;
                while ((count = input.read(buffer)) != -1) digest.update(buffer, 0, count);
            }
            StringBuilder result = new StringBuilder();
            for (byte value : digest.digest()) result.append(String.format("%02x", value & 0xff));
            return result.toString();
        } catch (Exception error) {
            throw new IllegalStateException("Cannot identify parser build", error);
        }
    }

    public static void main(String[] args) throws Exception {
        // Loopback only: the parser accepts untrusted replay bytes, not public traffic.
        // A bind conflict fails startup; never evict another listener.
        int port = Integer.parseInt(System.getProperty("parser.port", "5600"));
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", port), 0);
        server.createContext("/", new MyHandler());
        server.createContext("/healthz", new HealthHandler());
        server.createContext("/blob", new BlobHandler());
        server.setExecutor(java.util.concurrent.Executors.newCachedThreadPool());
        server.start();
        System.err.println("[Parser] service=oi-replay-parser protocol=1 build=" + BUILD_SHA256
                + " pid=" + ProcessHandle.current().pid() + " address=" + server.getAddress());

        // Re-register ourselves
        Timer timer = new Timer();
        TimerTask task = new RegisterTask();
        timer.schedule(task, 0, 5000);
    }

    static class MyHandler implements HttpHandler {
        @FunctionalInterface
        interface Decoder {
            boolean parse(InputStream input, OutputStream output, boolean blob) throws Exception;
        }

        private final Decoder decoder;

        MyHandler() {
            this((input, output, blob) -> new Parse(input, output, blob).epilogue);
        }

        // Injectable so the HTTP contract can also be tested after partial output.
        MyHandler(Decoder decoder) {
            this.decoder = decoder;
        }

        @Override
        public void handle(HttpExchange t) throws IOException {
            String requestId = UUID.randomUUID().toString();
            Path staged = null;
            try {
                try {
                    staged = Files.createTempFile("replay-parse-", ".ndjson");
                    Map<String, String> query = splitQuery(t.getRequestURI());
                    try (OutputStream output = Files.newOutputStream(staged)) {
                        boolean complete = decoder.parse(t.getRequestBody(), output, query.containsKey("blob"));
                        // Community opts in; retain the legacy success format for other callers.
                        if ("1".equals(query.get("strict")) && !complete) {
                            throw new IOException("Replay ended without an epilogue");
                        }
                    }
                    // Consume unread upload bytes before replying, including on decoder failure.
                    // Otherwise curl can see a broken pipe instead of the actual HTTP error.
                    t.getRequestBody().transferTo(OutputStream.nullOutputStream());
                } catch (Exception e) {
                    System.err.println("[Replay] requestId=" + requestId + " parse failed");
                    e.printStackTrace(System.err);
                    try {
                        t.getRequestBody().transferTo(OutputStream.nullOutputStream());
                    } catch (IOException drainError) {
                        System.err.println("[Replay] requestId=" + requestId + " upload drain failed: " + drainError);
                    }
                    byte[] error = ("{\"ok\":false,\"error\":{\"code\":\"REPLAY_DECODE_FAILED\","
                            + "\"message\":\"Replay could not be decoded. Re-download the replay and try again; "
                            + "if it still fails, ask an admin to update the replay parser.\","
                            + "\"requestId\":\"" + requestId + "\"}}\n").getBytes(StandardCharsets.UTF_8);
                    t.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
                    t.sendResponseHeaders(422, error.length);
                    t.getResponseBody().write(error);
                    return;
                }
                // No headers or event bytes are sent until parsing has finished successfully.
                t.getResponseHeaders().set("Content-Type", t.getRequestURI().getRawQuery() != null
                        && splitQuery(t.getRequestURI()).containsKey("blob")
                        ? "application/json" : "application/x-ndjson");
                t.getResponseHeaders().set("X-Replay-Parse-Complete", "1");
                t.sendResponseHeaders(200, Files.size(staged));
                Files.copy(staged, t.getResponseBody());
            } finally {
                t.close();
                if (staged != null) {
                    Files.deleteIfExists(staged);
                }
            }
        }
    }

    static class HealthHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange t) throws IOException {
            JsonObject health = new JsonObject();
            health.addProperty("service", "oi-replay-parser");
            health.addProperty("status", "ok");
            health.addProperty("protocolVersion", 1);
            health.addProperty("buildSha256", BUILD_SHA256);
            health.addProperty("pid", ProcessHandle.current().pid());
            health.addProperty("startedAt", STARTED_AT);
            byte[] body = health.toString().getBytes(StandardCharsets.UTF_8);
            t.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
            t.getResponseHeaders().set("Cache-Control", "no-store");
            t.sendResponseHeaders(200, body.length);
            try (OutputStream os = t.getResponseBody()) {
                os.write(body);
            }
        }
    }

    static class BlobHandler implements HttpHandler {
        private final MyHandler.Decoder decoder;
        private final Duration fetchTimeout;
        private final HttpClient client = HttpClient.newHttpClient();

        BlobHandler() {
            this((input, output, blob) -> new Parse(input, output, blob).epilogue, Duration.ofSeconds(600));
        }

        BlobHandler(MyHandler.Decoder decoder, Duration fetchTimeout) {
            this.decoder = decoder;
            this.fetchTimeout = fetchTimeout;
        }

        @Override
        public void handle(HttpExchange t) throws IOException {
            String requestId = UUID.randomUUID().toString();
            int status = 400;
            String code = "REPLAY_URL_INVALID";
            String message = "Provide a valid HTTP or HTTPS replay_url.";
            try {
                byte[] parseOut;
                try {
                    Map<String, String> query = splitQuery(t.getRequestURI());
                    URI replayUrl = URI.create(query.getOrDefault("replay_url", ""));
                    if (replayUrl.getHost() == null || !("http".equalsIgnoreCase(replayUrl.getScheme())
                            || "https".equalsIgnoreCase(replayUrl.getScheme()))) {
                        throw new IllegalArgumentException("replay_url must be an absolute HTTP(S) URL");
                    }
                    status = 502;
                    code = "REPLAY_FETCH_FAILED";
                    message = "Replay could not be downloaded. Check the replay URL and try again.";
                    HttpRequest request = HttpRequest.newBuilder()
                            .uri(replayUrl)
                            .timeout(fetchTimeout)
                            .build();
                    HttpResponse<byte[]> response = client.send(request,
                            HttpResponse.BodyHandlers.ofByteArray());
                    if (response.statusCode() < 200 || response.statusCode() >= 300) {
                        throw new IOException("Replay upstream returned HTTP " + response.statusCode());
                    }
                    byte[] replay = response.body();
                    if (replayUrl.getPath().endsWith(".bz2")) {
                        status = 422;
                        code = "REPLAY_DECOMPRESSION_FAILED";
                        message = "Compressed replay could not be opened. Re-download the replay and try again.";
                        try (InputStream compressed = new BZip2CompressorInputStream(
                                new ByteArrayInputStream(replay), true)) {
                            replay = compressed.readAllBytes();
                        }
                    }
                    status = 422;
                    code = "REPLAY_DECODE_FAILED";
                    message = "Replay could not be decoded. Re-download the replay and try again; "
                            + "if it still fails, ask an admin to update the replay parser.";
                    ByteArrayOutputStream output = new ByteArrayOutputStream();
                    // Preserve legacy completeness semantics; strict epilogues remain upload-only.
                    decoder.parse(new ByteArrayInputStream(replay), output, true);
                    parseOut = output.toByteArray();
                } catch (Exception ex) {
                    if (ex instanceof HttpTimeoutException && status == 502) {
                        status = 504;
                        code = "REPLAY_FETCH_TIMEOUT";
                        message = "Replay download timed out. Try again later or use another replay URL.";
                    }
                    if (ex instanceof InterruptedException) Thread.currentThread().interrupt();
                    System.err.println("[Replay/blob] requestId=" + requestId + " code=" + code);
                    ex.printStackTrace(System.err);
                    JsonObject error = new JsonObject();
                    error.addProperty("code", code);
                    error.addProperty("message", message);
                    error.addProperty("requestId", requestId);
                    JsonObject result = new JsonObject();
                    result.addProperty("ok", false);
                    result.add("error", error);
                    byte[] body = (result.toString() + "\n").getBytes(StandardCharsets.UTF_8);
                    t.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
                    t.sendResponseHeaders(status, body.length);
                    t.getResponseBody().write(body);
                    return;
                }
                // A response-write failure must not attempt to send a second set of headers.
                t.sendResponseHeaders(200, parseOut.length);
                t.getResponseBody().write(parseOut);
            } finally {
                t.close();
            }
        }
    }

    public static Map<String, String> splitQuery(URI uri) throws UnsupportedEncodingException {
        Map<String, String> query_pairs = new LinkedHashMap<String, String>();
        String query = uri.getRawQuery();
        if (query == null || query.isEmpty()) {
            return query_pairs;
        }
        String[] pairs = query.split("&");
        for (String pair : pairs) {
            int idx = pair.indexOf("=");
            if (idx < 0) {
                query_pairs.put(URLDecoder.decode(pair, "UTF-8"), "");
                continue;
            }
            query_pairs.put(URLDecoder.decode(pair.substring(0, idx), "UTF-8"),
                    URLDecoder.decode(pair.substring(idx + 1), "UTF-8"));
        }
        return query_pairs;
    }
}

class RegisterTask extends TimerTask {
    public void run() {
        if (System.getenv().containsKey("SERVICE_REGISTRY_HOST")) {
            try {
                String ip = "";
                if (System.getenv().containsKey("EXTERNAL")) {
                    // If configured as external, request external IP and report it
                    ip = RegisterTask.shellExec("curl " + System.getenv().get("SERVICE_REGISTRY_HOST") + "/ip");
                } else {
                    // Otherwise, use hostname -i to get internal IP
                    ip = RegisterTask.shellExec("hostname -i");
                }
                long nproc = Math.max(Runtime.getRuntime().availableProcessors(), 10);
                String postCmd = "curl -X POST --max-time 60 -L " + System.getenv().get("SERVICE_REGISTRY_HOST")
                        + "/register/parser/" + ip + ":5600" + "?size=" + nproc + "&key="
                        + System.getenv().get("RETRIEVER_SECRET");
                System.err.println(postCmd);
                RegisterTask.shellExec(postCmd);
            } catch (Exception e) {
                System.err.println(e);
            }
        }
    }

    public static String shellExec(String cmdCommand) throws IOException {
        final StringBuilder stringBuilder = new StringBuilder();
        String[] cmdArr = cmdCommand.split(" ");
        final Process process = Runtime.getRuntime().exec(cmdArr, null, null);
        final BufferedReader bufferedReader = new BufferedReader(new InputStreamReader(process.getInputStream()));
        String line;
        while ((line = bufferedReader.readLine()) != null) {
            stringBuilder.append(line);
        }
        return stringBuilder.toString();
    }
}
