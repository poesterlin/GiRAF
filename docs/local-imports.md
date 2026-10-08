# Organizing files before upload

Selecting or dropping files in Import now opens a local staging gallery rather
than starting a transfer immediately.

1. Select photos in the gallery (all newly added files are initially selected).
2. Enter a new session name or choose an existing session.
3. Click **Assign selected**. Repeat for other groups.
4. Click **Upload assigned photos**. Unassigned files remain local.

RAF thumbnails come from the camera's embedded JPEG, not browser RAW development.
JPEG and PNG selections also have local previews. Other formats can be selected
and assigned using their filenames but currently show a preview placeholder.
Capture timestamps are read from embedded JPEG EXIF when available; sorting
otherwise uses file modification time. The browser resizes thumbnails to 480
pixels where supported, with two preview operations active at a time.

Staged selections are kept on the Import page, not persisted across navigation
or reload. Uploads that have already started continue through the global upload
state during client-side navigation. No file or preview is sent to the server
until Upload is clicked. Session creation happens after that group's uploads.

Duplicate detection sends only the filename, byte count and SHA-256 fingerprint
before upload. Hashing reads local files in 1 MiB chunks and reuses the result
when Upload is clicked. Renamed exact duplicates are detected; different photos
sharing a filename are not rejected. Copies within a local selection are also
flagged. Already-imported files are excluded, while pending uploaded files can
be assigned to a session without transferring the RAW again.

The server persists hashes and sizes on import records. Older records are
indexed lazily: file sizes are checked first, then only matching-size candidates
are hashed. The first duplicate check can take longer while these records are
indexed. Missing original sources cannot be fingerprinted retroactively.
Duplicate checks fail closed before a transfer if the service is unavailable.
This detects identical files, not visually similar photographs or changed RAWs.

Each session group collects successful import IDs and submits one assignment
request after its transfers finish. Failed transfers remain available for retry;
when a new session was created successfully, retries target that session. Files
whose assignment fails remain in the server import queue for manual assignment.
Existing sessions with active jobs cannot accept another assignment until their
current job finishes. Already-imported IDs cannot create duplicate image rows.

RAF extraction is bounded to the file header, the JPEG metadata prefix and the
embedded JPEG slice. Original sensor data and original files are untouched.
Preview URLs and image-bitmap resources are released when no longer needed.

Validation includes synthetic RAF/JPEG/PNG parser cases, real RAF extraction from
DSCF0001/0011/0019, and a browser gallery test that confirms there are no upload
calls before explicit upload and verifies separate new/existing-session targets.
