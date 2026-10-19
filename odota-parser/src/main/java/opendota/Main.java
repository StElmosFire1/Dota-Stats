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
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Timer;
import java.util.TimerTask;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import org.apache.commons.compress.compressors.bzip2.BZip2CompressorInputStream;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;

public class Main {

    public static void main(String[] args) throws Exception {
        HttpServer server = HttpServer.create(new InetSocketAddress(Integer.valueOf("5600")), 0);
        server.createContext("/", new MyHandler());
        server.createContext("/healthz", new HealthHandler());
        server.createContext("/blob", new BlobHandler());
        server.setExecutor(java.util.concurrent.Executors.newCachedThreadPool());
        server.start();

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
            t.sendResponseHeaders(200, 2);
            OutputStream os = t.getResponseBody();
            os.write("ok".getBytes());
            os.close();
        }
    }

    static class BlobHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange t) throws IOException {
            try {
                Map<String, String> query = splitQuery(t.getRequestURI());
                URI replayUrl = URI.create(query.get("replay_url"));
                // Get the replay as a byte[]
                long tStart = System.currentTimeMillis();
                ExecutorService executor = Executors.newSingleThreadExecutor();
                Future<byte[]> future = executor.submit(() -> {
                    HttpClient client = HttpClient.newHttpClient();
                    HttpRequest request = HttpRequest.newBuilder()
                            .uri(replayUrl)
                            .build();
                    HttpResponse<byte[]> response = client.send(request,
                            HttpResponse.BodyHandlers.ofByteArray());
                    return response.body();
                });
                byte[] bzIn = future.get(600, TimeUnit.SECONDS);
                long tEnd = System.currentTimeMillis();
                System.err.format("download: %dms\n", tEnd - tStart);

                byte[] bzOut = bzIn;
                if (replayUrl.toString().endsWith(".bz2")) {
                    tStart = System.currentTimeMillis();
                    // Write byte[] to bunzip, get back decompressed byte[]
                    // The C decompressor is a bit faster than Java, 4.3 vs 4.8s
                    // BZip2CompressorInputStream bz = new BZip2CompressorInputStream(new ByteArrayInputStream(bzIn));
                    // bzOut = bz.readAllBytes();
                    // bz.close();

                    Process bz = new ProcessBuilder(new String[] { "bunzip2" }).start();
                    // Start separate thread so we can consume output while sending input
                    new Thread(() -> {
                        try {
                            bz.getOutputStream().write(bzIn);
                            bz.getOutputStream().close();
                        } catch (IOException ex) {
                            ex.printStackTrace();
                        }
                    }).start();

                    bzOut = bz.getInputStream().readAllBytes();
                    bz.getInputStream().close();
                    String bzError = new String(bz.getErrorStream().readAllBytes());
                    bz.getErrorStream().close();
                    System.err.println(bzError);
                    if (bzError.toString().contains("bunzip2: Data integrity error when decompressing") || bzError.contains("bunzip2: Compressed file ends unexpectedly")) {
                        // Corrupted replay, don't retry
                        t.sendResponseHeaders(204, 0);
                        t.getResponseBody().close();
                        return;
                    }
                    tEnd = System.currentTimeMillis();
                    System.err.format("bunzip2: %dms\n", tEnd - tStart);
                }

                // Start parser with input stream created from byte[]
                tStart = System.currentTimeMillis();
                ByteArrayOutputStream parseOutStream = new ByteArrayOutputStream();
                new Parse(new ByteArrayInputStream(bzOut), parseOutStream, true);
                byte[] parseOut = parseOutStream.toByteArray();
                tEnd = System.currentTimeMillis();
                System.err.format("parse: %dms\n", tEnd - tStart);

                t.sendResponseHeaders(200, parseOut.length);
                t.getResponseBody().write(parseOut);
                t.getResponseBody().close();
            } catch (Exception ex) {
                ex.printStackTrace();
                t.sendResponseHeaders(500, 0);
                t.getResponseBody().close();
            }
            // long tStart = System.currentTimeMillis();
            // String cmd = String.format("""
            //         curl --max-time 145 --fail -L %s | %s | curl -X POST -T - "localhost:5600?blob"
            //         """,
            //         replayUrl.toString(),
            //         replayUrl.toString().endsWith(".bz2") ? "bunzip2" : "cat");
            // System.err.println(cmd);
            // Process proc = new ProcessBuilder(new String[] { "bash", "-c", cmd })
            //         .start();
            // byte[] parseOut = proc.getInputStream().readAllBytes();
            // String error = new String(proc.getErrorStream().readAllBytes());
            // System.err.println(error);
            // int exitCode = proc.waitFor();
            // long tEnd = System.currentTimeMillis();
            // System.err.format("download/bunzip2/parse: %sms\n", tEnd - tStart);
            // if (exitCode == 0) {
            //     t.sendResponseHeaders(200, parseOut.length);
            //     t.getResponseBody().write(parseOut);
            //     t.getResponseBody().close();
            // } else {
            //     // We can send 204 status here and no response if expected error
            //     // Maybe we can pass the specific error info in the response headers
            //     int status = 500;
            //     if (error.toString().contains("curl: (28) Operation timed out")) {
            //         // Parse took too long, maybe China replay?
            //         status = 204;
            //     }
            //     if (error.toString().contains("curl: (22) The requested URL returned error: 502")) {
            //         // Google-Edge-Cache: origin retries exhausted Error: 2010
            //         // Server error, don't retry
            //         status = 204;
            //     }
            //     if (error.toString().contains("bunzip2: Data integrity error when decompressing")) {
            //         // Corrupted replay, don't retry
            //         status = 204;
            //     }
            //     if (error.toString().contains("bunzip2: Compressed file ends unexpectedly")) {
            //         // Corrupted replay, don't retry
            //         status = 204;
            //     }
            //     if (error.toString().contains("bunzip2: (stdin) is not a bzip2 file.")) {
            //         // Tried to unzip a non-bz2 file
            //         status = 204;
            //     }
            //     if (status == 204) {
            //         t.sendResponseHeaders(status, 0);
            //         t.getResponseBody().close();
            //     } else {
            //         throw new Exception("Unexpected error in parse pipeline");
            //     }
            // }
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
