import java.io.*;
import opendota.Parse;

/** Offline regression probe: no HTTP listener, database, or app side effects. */
class ReplayFileProbe {
    public static void main(String[] args) throws Exception {
        if (args.length != 2) throw new IllegalArgumentException("Usage: replay.dem output.jsonl");
        try (InputStream input = new BufferedInputStream(new FileInputStream(args[0]));
             OutputStream output = new BufferedOutputStream(new FileOutputStream(args[1]))) {
            new Parse(input, output, false);
        }
    }
}
