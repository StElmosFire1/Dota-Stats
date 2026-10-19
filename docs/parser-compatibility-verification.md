# Replay parser compatibility update — prepared, not deployed

## Scope

This update changes the shared Java replay parser only. No live server was
accessed or restarted during preparation, and no match was imported into a
database. No website or Discord notification was triggered by the tests.

Clarity is pinned to 4.0.3, with clarity-protobuf pinned to 6.3. The custom ward
event definitions and combat-log imports were adapted for Clarity 4's APIs.
The shaded JAR merges Clarity's provider index with our custom ward provider.

## Reproduced failure and result

The user-supplied replay for match **9050540263** was tested locally.

| Check | Result |
| --- | --- |
| Original parser, Clarity 3.1.3 | Failed with ArrayIndexOutOfBoundsException, index 504 |
| Updated parser, direct file parsing | Completed successfully |
| Updated production HTTP handlers, loopback-only ephemeral test port | Completed successfully through curl POST |
| JSON event output | 188,233 events, all decoded as JSON |
| Community stats aggregation | Match 9050540263; 10 players; 2,210 seconds; Dire victory |
| Full-edition stats aggregation | Same match, player count, duration and winner |
| Ward events | 34 observer placements, 29 observer removals, 62 sentry placements |
| Per-player checks | Ten distinct slots; finite nonnegative K/D/A/GPM/XPM; ward placements populated |
| Build freshness gate | Passed |

This validates recovery for the supplied replay. It does not identify the exact
upstream decoder commit responsible, prove every statistic against an external
scoreboard, or establish compatibility with all older replay formats.

## Re-run

Requires Java/JDK 21, Maven, Node.js and curl. From the repository root:

```bash
cd odota-parser
mvn clean package
cd ..
node scripts/test-parser-compat.cjs /path/to/replay.dem 9050540263
bash scripts/build-parser.sh --check
```

The HTTP probe binds to an ephemeral localhost port, not the normal parser port.
It starts neither website nor bot and does not write match data. Test output
goes under ignored `generated-artifacts/parser-compat/`.

For direct-file investigation:

```bash
java -Xmx1536m -cp odota-parser/target/stats-0.1.0.jar \
  scripts/ReplayFileProbe.java /path/to/replay.dem /tmp/replay-events.jsonl
```

Replay fixtures, raw replay events, player stats and diagnostic logs are not
included in the downloadable update package.

## Release boundary

The downloadable package contains the tested JAR, this report and a SHA-256
checksum file. It does not install or restart anything.

Installing on production needs separate approval: both editions currently use
the shared parser. Keep the old JAR for rollback, replace atomically only in an
agreed maintenance window, then restart the actual serving Java process—not
just a website that may adopt an already-running parser.

Before a general rollout, testing a selection of older known-good replays is
recommended. Only the supplied distinct replay was available in this workspace.

Unchanged limitations: the Java HTTP handler still obscures parsing exceptions
with transport-level errors, and parser lifecycle ownership is still shared
between the two apps. This compatibility change does not resolve those issues.
