# Preview rendering analytics

Umami receives `preview-render` events from the editor's server-only staged
JPEG previews. Events use `engine=server`, `routing=server-only-editor`, and
`stage=quick` or `final`. Each JPEG is decoded before it is published. No visible
engine indicator or other UI copy is added.

## Inspecting a phone session

In Umami, open the `preview-render` event data and inspect:

- `requestId`: correlates initial and refined server previews for one edit.
- `outcome`: displayed, cancelled, or error.
- `device`, viewport width, pixel ratio, cores, memory, connection hints,
  and Data Saver.
- `ttfbMs`: fetch start to response headers, including server work and network.
- `downloadMs`, `decodeMs`, `bytes`, `width`, `height`, and JPEG `quality`.
- `stageMs`: stage duration, including refinement settling time.
- `totalMs`: time since the edit's initial preview request.
- `server_databaseMs`, `server_sourceMs`, `server_mappingMs`,
  `server_renderMs`, `server_readMs`, `server_totalMs`, `server_requestMs`.
- `serverCache` and `sourceCache`: JPEG and full-resolution TIFF cache status.

`ttfbMs` overlaps server timings. `totalMs` ends when a decoded image is
published.

`preview-refinement-skipped` records constrained-device/connection skips after
a successful quick preview. If the quick preview fails, the final stage can
still recover; if refinement fails, the successful quick preview is retained
(`retainedPreview=true` on the error event).
Network information is browser-dependent; missing hints are marked unknown.
Events contain no PP3 profiles, LUT paths, image names, or image pixels.

Tracking is fire-and-forget. A bounded queue waits up to 30 seconds for the
deferred Umami script, and analytics failures do not affect preview rendering.

## Additional diagnostics (analyticsVersion=2)

- `responseReuse`: `fresh` when the server echoes this edit's request ID,
  `reused` when a cached response echoes an earlier ID, or `unknown` for older
  responses without the header. This identifies response reuse, not whether
  the browser, a service worker, or another HTTP cache supplied it.
- `serverTimingsFresh`: only fresh responses include `server_*Ms` timings.
  Reused/unknown responses use `serverCache=not-current` and
  `sourceCache=not-current` to avoid attributing historical processing to this fetch.
- `serverRequestId`: echoed ID; fresh requests can be matched to structured
  `[preview-render]` JSON entries in container logs. Logs omit profiles and paths.
- `settlingMs`, `fetchMs`, `phase`, `failureReason`, `abortReason`: phase duration
  and failure/cancellation classification. Effect cleanup is labeled
  `edit-or-navigation`; it does not distinguish those two causes.
- `visibility`: foreground/background page state at event collection.
- Separate `preview-paint` events share `requestId` and `stage`, reporting
  `publishToPaintOpportunityMs` after two animation frames. This is an estimate
  of a paint opportunity, not proof that pixels reached the display. Hidden or
  superseded previews do not emit this event, and rendering never waits for it.

Cached refinements bypass settling: after the quick preview, a browser-cache-only
fetch is attempted, followed by a server JPEG-cache-only request on a miss.
Neither lookup may start a RAW render. `refinementCache=browser|server|miss`,
`cacheLookupMs`, and `settleSkipped` describe this path. Cache misses retain the
normal settling delay; constrained successful previews still skip refinement.
