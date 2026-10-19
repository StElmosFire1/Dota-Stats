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

### Replay-URL response contract

`GET /blob?replay_url=<URL-encoded absolute HTTP(S) URL>` downloads and parses a
replay. Successful responses remain HTTP 200 with the **same blob bytes and fixed
content length** as before. This endpoint does not opt into strict epilogue
validation or the upload completion header. A URL whose path ends in `.bz2`
is decompressed before decoding, including when the URL has query parameters.
Concatenated bzip2 streams are supported; malformed, truncated, or CRC-invalid
compressed data is rejected before invoking the decoder.

All failures use `Content-Type: application/json; charset=utf-8` and this shape:

```json
{"ok":false,"error":{"code":"REPLAY_FETCH_FAILED","message":"Replay could not be downloaded. Check the replay URL and try again.","requestId":"correlation-id"}}
```

| HTTP | Error code | Meaning / next step |
| --- | --- | --- |
| 400 | `REPLAY_URL_INVALID` | Missing, malformed, relative, or non-HTTP(S) URL; correct the URL. |
| 502 | `REPLAY_FETCH_FAILED` | Upstream non-2xx response (including redirects), connection failure, or failed transfer; check URL/upstream availability. |
| 504 | `REPLAY_FETCH_TIMEOUT` | Download exceeded the 600-second deadline; try later or use another URL. |
| 422 | `REPLAY_DECOMPRESSION_FAILED` | Invalid compressed replay; re-download it. |
| 422 | `REPLAY_DECODE_FAILED` | Replay decoder failed; re-download, then ask an admin to update the parser if needed. |

No error returns partial blob data or an empty 204/500 response. Each request ID,
failure code, exception message/type, and stack trace is logged to server stderr.
Upstream response bodies, raw exceptions, and decoder output are not sent in
error responses. Downloads use the HTTP client's request deadline, not an
abandoned executor task, and decompression uses the existing Java bzip2 library
rather than parsing a subprocess's stderr.

**Caller compatibility:** the repository's full/community application clients
upload to `/`, not `/blob`; no application caller depends on `/blob` returning
204. `scripts/test.sh` is the only direct `/blob` caller found. External callers
must migrate any old 204/no-retry logic: inspect the JSON code, treat invalid
URLs and 422s as requiring corrected input, and retry fetch errors/timeouts
only when appropriate. Redirects are not followed (unchanged HTTP client policy),
but their status is now reported as a fetch error rather than decoded as a replay.
The upload response contract above is unchanged.

Build and run the regressions from the repository root:

```sh
bash scripts/build-parser.sh
node --test --test-force-exit community-edition/tests/replayParserFailure.test.js community-edition/tests/replayUploadFailure.test.js
```

The HTTP contract tests require JDK 21 (`java` and `javac`) and the rebuilt JAR.
They run local HTTP upstreams, with no external replay download dependency, and
cover bad URLs, upstream statuses/connections/timeouts, malformed/truncated/CRC
compressed data, real and partial-output decoder failures, and unchanged plain,
compressed, and concatenated-stream success bodies.