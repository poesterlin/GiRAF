# Edited gallery thumbnails

Saving a snapshot queues a 600-pixel WebP thumbnail rendered from the editor TIFF
with the saved PP3 settings. Generation runs serially in the background, so saving
does not wait for RawTherapee. Pending saves for the same image are coalesced.

Autosave rewrites the newest snapshot in place for small tweaks and leaves its
thumbnail untouched, so the gallery keeps showing the render made when that
version was created. Structural work, a version that is ten minutes old or
already exported, and a manual save all create a new snapshot and render a fresh
thumbnail.

Files live in `edited-thumbnails/` beside the editor TIFF and are keyed by image,
image version and snapshot ID. Publishing uses an atomic rename; an older render
cannot replace a newer snapshot's thumbnail. The directory shares the TIFF's
storage lifetime. No database migration is required.

The gallery requests the latest snapshot's thumbnail and keeps lazy loading.
Missing files immediately return the original thumbnail without caching headers
and queue background generation. Queued and active renders are deduplicated.
Completed edited thumbnails use immutable browser caching. Existing snapshots
receive edited thumbnails when requested by the gallery or settings are saved.

Generation failures are logged without failing the saved edit. The background
queue is in-process; pending work is not retained across application restarts.
