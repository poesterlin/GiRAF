# Organizing files before upload

## Timing diagnostics

Browser console messages prefixed `[import-timing]` record batch size, preview
queue wait, extraction/read/decode times, worker fallback errors, hash duration,
duplicate-check duration, transfer start, bytes sent, and server response.
`ms` is the duration of the named stage; queue/ready/started timings are measured
from batch selection. `at` is relative to page navigation. The latest 3,000
entries are retained in memory as `window.__importTimings` (including filenames,
but no photo contents). Copy them from the browser console with:

```js
copy(JSON.stringify(window.__importTimings, null, 2))
```

Server logs prefixed `[import-timing:server]` separate duplicate-indexing time
from database lookup time. Diagnostics are session-local and reset on reload.

## Workflow

Camera/USB sources are prepared by the upload queue. Files up to 64 MiB are read
once into a memory-backed File; hashing, transfer and preview extraction reuse
that copy. Camera reads are serialized, and at most three upload slots retain
source snapshots (192 MiB of source payload, plus browser/worker overhead).
Previews no longer read ahead from the camera. Larger files keep bounded hashing
and stream their original source to the server, using the server preview after
upload rather than opening the camera for an additional local preview.
`upload.source-ready` logs preparation time and whether the source was buffered.

Selecting or dropping files shows local previews and immediately starts background
uploads after each file's duplicate check. Session grouping is independent of
transfer progress.

1. Select photos in the existing date-grouped image grid.
2. Open the existing Import selection bar and session modal.
3. Enter a new session name or choose an existing session, then confirm.
4. Repeat for other groups. Uploads continue whether or not files are selected.

Local previews use the original importer layout, not a separate gallery or
toolbar. Local previews, uploading files and server-queued images can be selected
together. Ready photos join the chosen session immediately; pending uploads join
the same session as they finish, with no additional user action.

RAF thumbnails come from the small camera JPEG inside EXIF when available,
falling back to the larger embedded preview, not browser RAW development.
JPEG and PNG selections also have local previews. Other formats can be selected
and assigned using their filenames but currently show a preview placeholder.
Capture timestamps are read from embedded JPEG EXIF when available; sorting
otherwise uses file modification time. The browser resizes thumbnails to 480
pixels where supported, with two preview operations active at a time. Extraction,
thumbnail decoding/resizing, JPEG encoding and staging fingerprints run in a
dedicated worker. Preview generation has its own queue, independent of duplicate
network checks. Fingerprints are reused by the upload preflight. Worker failures
fall back to bounded direct extraction. Small embedded thumbnails skip canvas
resampling and re-encoding, and preserve EXIF orientation. The DSCF0001 fixture
uses about 9 KB for its thumbnail instead of its 5 MB embedded full preview.
Preview placeholders use a small monochrome spinner, not loading text.

Local-only cards carry an upload icon which becomes a spinner during upload.
The modal closes when grouping is confirmed; the progress bar, notification indicator
and start toast appear immediately, including during preflight checks.

Staged selections are kept on the Import page, not persisted across navigation
or reload. Uploads that have already started continue through the global upload
state during client-side navigation. Confirmed grouping also continues if the
user navigates away. The first ready photo creates the session; later photos
reuse it automatically.

Duplicate detection sends only the filename, byte count and SHA-256 fingerprint
before upload. Hashing reads local files in bounded 16 MiB chunks and reuses the result
for the transfer preflight. Renamed exact duplicates are detected; different photos
sharing a filename are not rejected. Copies within a local selection are also
flagged. Already-imported files are excluded, while pending uploaded files can
be assigned to a session without transferring the RAW again.

The server persists hashes and sizes on import records. Older records are
indexed lazily: file sizes are checked first, then only matching-size candidates
are hashed. The first duplicate check can take longer while these records are
indexed. Missing original sources cannot be fingerprinted retroactively.
Duplicate checks fail closed before a transfer if the service is unavailable.
This detects identical files, not visually similar photographs or changed RAWs.
Preflight checks run per file in the bounded transfer queue, rather than waiting
for all selected files to be hashed before beginning the first upload.

Each grouped file is assigned as soon as its upload completes and starts processing
without waiting for the other transfers. Assignment requests are serialized to
create a new session only once. Arrivals during an active import queue a follow-up
run; session jobs never overlap. Failed transfers remain available for retry;
when a new session was created successfully, retries target that session. Files
whose assignment fails remain in the server import queue for manual assignment.
Existing sessions with active exports cannot accept another assignment until
their current job finishes. Already-imported IDs cannot create duplicate image rows.

RAF extraction is bounded to the file header, the JPEG metadata prefix and the
embedded JPEG slice. Original sensor data and original files are untouched.
Preview URLs and image-bitmap resources are released when no longer needed.

Validation includes synthetic RAF/JPEG/PNG parser cases, real RAF extraction from
DSCF0001/0011/0019, mixed ready/pending assignment tests, and browser checks of the
local-preview worker and upload feedback.
