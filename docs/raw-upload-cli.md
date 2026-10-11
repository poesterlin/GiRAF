# Resilient RAW uploader

Build a standalone executable (Bun is needed only for building):

```sh
bun run upload:compile
```

Copy `dist/raw-upload` somewhere on your PATH, change into the folder containing
your RAW files, and run:

```sh
raw-upload
# Unattended:
raw-upload --url https://raw.oesterlin.dev --yes
```

Uses Clack prompts and a spinner with file/chunk progress. Scans only the current
directory, case-insensitively, for common RAW extensions. Does not modify source
files. Supports individual files up to 512 MiB. Files go into GiRAF's import queue;
assign them to sessions in the importer.

Uploads one file at a time in 256 KiB chunks with SHA-256 checksums. The server
retains acknowledged chunks in `IMPORT_DIR/.resumable`; restarting the program,
changing networks, or restarting the editor resumes from those chunks. Completion
receipts also live on the server, so no local progress file is required. Successful
completion removes chunk data, retaining a small receipt. Incomplete uploads stay
on disk until resumed or manually removed by the server administrator.

Network errors, timeouts, HTTP 408/425/429 and 5xx responses retry indefinitely
with jittered exponential backoff capped near one minute. Each request has a
nine-minute timeout (below the server's ten-minute body-read limit); only the
current chunk is retransmitted. Ctrl+C stops safely.
Permanent HTTP errors and file errors are reported, other files continue, and
the process exits nonzero if any files failed. Run again to retry them.

Requires the `/api/imports/resumable/[hash]` server API from this checkout. Older
servers return HTTP 404. Optional `GIRAF_COOKIE` and `GIRAF_TOKEN` environment
variables forward a cookie or bearer token when an upstream proxy requires them.

The web importer uses the same resumable API, with adaptive concurrency and
automatic retries. Keep the tab open to retry through connectivity interruptions.
After a reload or browser restart, reselect the original files: the browser hashes
them and resumes their server-held chunks. File access itself is not persisted by
the browser. Thumbnail generation runs independently from the upload queue.

The default build targets the build machine's OS/architecture. Cross-compile with
Bun's `--target`, for example:

```sh
bun build scripts/raw-upload.ts --compile --target bun-darwin-arm64 --outfile dist/raw-upload-macos-arm64
bun build scripts/raw-upload.ts --compile --target bun-windows-x64 --outfile dist/raw-upload.exe
```

Verify the executable against a local fault-injecting HTTP server:

```sh
bun run upload:compile
bun test scripts/raw-upload.test.ts
```

## Real-browser integration probe

This opt-in test uses a real RAW fixture, Chromium and the live importer. It loses
a chunk acknowledgement after the server stores it, interrupts subsequent uploads,
reloads the page and reselects the file. It checks that saved chunks are not sent
again and that finalization creates exactly one import-queue row with the expected
size and SHA-256. The original fixture is untouched; a temporary copy with a unique
trailing probe marker prevents the server from skipping it as an existing photo.

```sh
bunx playwright install chromium
RAW_UPLOAD_TEST_FILE=/path/to/fixture.RAF \
RAW_UPLOAD_TEST_URL=https://raw.oesterlin.dev \
bun run test:upload:browser
```

The test prints its queue ID, server path and hash. It creates one deliberately
named `giraf-upload-probe-*` queue entry; run against a test instance when possible,
or remove that specific probe entry and its file after inspecting the result.
