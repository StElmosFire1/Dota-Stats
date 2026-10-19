package opendota;

import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.util.concurrent.Executors;

/** Runs the production handlers on an ephemeral, loopback-only test port. */
class ReplayHttpProbe {
    public static void main(String[] args) throws Exception {
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", new Main.MyHandler());
        server.createContext("/healthz", new Main.HealthHandler());
        server.setExecutor(Executors.newCachedThreadPool());
        server.start();
        System.out.println("TEST_PORT=" + server.getAddress().getPort());
    }
}
