# parser
Replay parse server generating logs from replay files

Quickstart
----
* Run the Java project (it'll start a webserver on port 5600)
* Or build manually with `mvn install`
* Run manually with `java -jar target/stats-0.1.0.jar`
* POST a .dem replay file to the server (example: scripts/test.sh)
* The parser returns line-delimited JSON in the HTTP response

### Uploaded replay response contract

`POST /?strict=1` (used by the community edition) requires end-of-match
epilogue metadata. The legacy `/` and `/?blob` success body formats are
unchanged; full-edition integration has not been migrated.

The upload handler stages output in a temporary file and does not send HTTP
headers or event data until decoding finishes. Successful responses include
`X-Replay-Parse-Complete: 1` and a fixed content length. Temporary output is
removed on both success and failure.

Decode failures return HTTP 422 with JSON, never partial event lines:

```json
{"ok":false,"error":{"code":"REPLAY_DECODE_FAILED","message":"Replay could not be decoded. Re-download the replay and try again; if it still fails, ask an admin to update the replay parser.","requestId":"correlation-id"}}
```

The request ID, exception type, message, and stack trace are written to server
stderr. Raw decoder diagnostics are not sent to uploaders. The request body is
drained before replying so a decoder failure early in a large upload does not
appear to the client as a send failure.

Community callers reject non-200 responses, missing completion headers,
truncated transfers, malformed event JSON, and missing epilogues before
aggregation or recording. Rebuild the JAR and restart the parser when updating
both sides of this contract; an old running parser is deliberately rejected.
The separate replay-URL `/blob` endpoint is not covered by this upload contract.

Build and run the regressions from the repository root:

```sh
bash scripts/build-parser.sh
node --test --test-force-exit community-edition/tests/replayParserFailure.test.js community-edition/tests/replayUploadFailure.test.js
```

The HTTP contract test requires JDK 21 (`java` and `javac`) and the rebuilt JAR.