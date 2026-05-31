---
name: ffmpeg zoompan + -loop frame explosion
description: Why ken-burns clip encodes hang/timeout, and the correct single-still zoompan invocation.
---

# ffmpeg zoompan on a still image: never combine `-loop 1 -t` with `d=`

Building a ken-burns clip from ONE still image with `zoompan` is pathologically
slow if you feed the image with `-loop 1 -t DUR` AND set `zoompan d=frames`.
`-loop` feeds many input frames (one per output tick), and `zoompan d=` emits `d`
output frames *per input frame* — so you get frames×frames work and it hangs
(one ~9s 720p clip didn't finish in 119s).

**Correct pattern:** feed the single image with no `-loop`, let zoompan emit the
frames, and cap with `-frames:v`:
```
ffmpeg -i still.png \
  -filter_complex "[0:v]scale=W*1.3:H*1.3,zoompan=z='min(zoom+0.00045,1.07)':d=FRAMES:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=WxH:fps=FPS,format=yuv420p[v]" \
  -map "[v]" -frames:v FRAMES -r FPS -c:v libx264 -preset veryfast -crf 22 out.mp4
```
With the fix, all 7 tutorial clips built in ~25s total (was timing out on one).

**Why:** zoompan's `d` is "duration in output frames per input frame", not total.
A single still input + `d=total` is the intended way; `-loop` double-counts.

**How to apply:** any time you make a zoom/pan clip from a static image
(scripts/build-tutorial-video.mjs). Also encode at 720p in stages
(STAGE=slides|clips|final, resumable) to stay under the 120s bash timeout.
