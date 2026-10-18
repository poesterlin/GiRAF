# Configuration

Copy `.env.example` to `.env` and adjust values. Docker Compose reads `.env` for the app and for the compose files themselves.

## Required

- `DATABASE_URL`: PostgreSQL connection string.
- `CLUT_DIR`: Folder with LUT files for film looks ([HaldCLUT pack](http://rawtherapee.com/shared/HaldCLUT.zip)). Only read.
- `IMPORT_DIR`: Folder scanned for new RAW files. Uploads land here too.
- `EXPORT_DIR`: Folder for exported photos.
- `TMP_DIR`: Folder for developed TIFFs, previews and other intermediates. Keep it on a persistent volume: the editor TIFFs live here, and photos whose TIFF is gone are developed again on the next import.

## Server

- `ORIGIN`: Public URL of GiRAF, such as `https://photos.example.com`. Needed behind a proxy so form submissions pass SvelteKit's origin check.
- `HOST_DOMAIN`: Public host name, such as `photos.example.com`. Used for the Google sign-in callback (`https://photos.example.com/api/auth/google/callback`; give a full `http://…` URL to override the scheme) and by `compose.deploy.yaml` for Traefik routing.
- `BODY_SIZE_LIMIT`: Largest request body. The Docker image sets `Infinity` so large RAW uploads work.
- `PUID`, `PGID`: User and group the container runs as (default `1000`). On start, the container gives `IMPORT_DIR`, `EXPORT_DIR`, `TMP_DIR`, `DATA_DIR` and `DEVELOP_CACHE_DIR` to this user, changing only files that belong to someone else, then drops root. Extra import folders and `CLUT_DIR` are never changed.
- `DATA_DIR`: Where the Google Photos sign-in is stored (default `data` in the working directory, `/app/data` in Docker). Mount it so the sign-in survives rebuilds.

## Imports

- `UPLOAD_RESUME_HOURS`: How long an unfinished upload may wait to be resumed before its chunks are deleted (default 4).
- `IMPORT_EXTRA_DIRS`: More folders to scan for RAW files, separated by `:`. They are only read; uploads still land in `IMPORT_DIR`.

### Automatic SD-card import

The `watchers` service polls the card's `DCIM` folder every few seconds, copies new photos into the import folder and starts an import. It is opt-in:

```bash
docker compose --profile sd-card up -d
```

- `SD_CARD_IMPORT_PATH`: Host folder where the card is mounted (default `/mnt/sdcard`). Used by `docker-compose.yml`.
- `SD_CARD_DIR`: Where the watcher sees the card inside its container (default `/app/sd-card-import`).
- `EDITOR_API_URL`: Import endpoint the watcher calls (default `http://localhost:3000/api/imports/run-import`; the compose file points it at the editor).

A card mounted after the service starts is picked up too. Files already in the import folder at the same size are skipped, so reinserting a card or restarting the service does not copy them again.

## Rendering

- `RENDER_CONCURRENCY`: Most RawTherapee processes at once (default half the CPU cores, at least 2). They start in priority order: the quick editor preview, the detailed preview, thumbnails, then imports and exports. The quick preview has one extra slot of its own.
- `OMP_WAIT_POLICY`: Leave unset. GiRAF lets idle RawTherapee threads sleep when renders run side by side, and spin when one runs alone, which is fastest in both cases. Setting it forces one behaviour for every render.
- `DEVELOP_CACHE_DIR`: Cache of full-size developed TIFFs for exports and large previews (default `$TMP_DIR/develop-cache`).
- `DEVELOP_CACHE_MAX_BYTES`: Size limit of that cache (default 6 GiB). The least recently used entries go first.
- `DEVELOP_CACHE_TTL_MS`: Entries unused for this long are removed (default 7 days).
- `RAWTHERAPEE_VERSION`: RawTherapee release used when building the Docker image (default the latest release).

## Integrations

- `IMMICH_BASE_URL`: Base URL of your Immich server.
- `IMMICH_API_KEY`: Immich API key.
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`: OAuth client for Google Photos, from a Google Cloud project with the Photos Library API enabled. GiRAF only asks for access to the albums and photos it creates.

Google Photos tuning, rarely needed:

- `GOOGLE_MAX_CONCURRENT_WRITES`: Uploads and album changes at once (default 3).
- `GOOGLE_CREATE_MAX_BATCH_SIZE`, `GOOGLE_CREATE_MAX_WAIT_MS`: Photos per create request and how long to wait to fill a batch (defaults 10 and 150 ms).
- `GOOGLE_ADD_MAX_BATCH_SIZE`, `GOOGLE_ADD_MAX_WAIT_MS`: The same for adding photos to an album (defaults 20 and 150 ms).

## Docker defaults

`docker-compose.selfhost.yml` sets:

- `CLUT_DIR=/app/cluts`, mounted from `./cluts`
- `IMPORT_DIR=/app/import`, mounted from `./import`
- `EXPORT_DIR=/app/export`, mounted from `./export`
- `TMP_DIR=/app/tmp`, mounted from `./tmp`
- `DATA_DIR=/app/data`, mounted from `./data`

The image has a health check on `GET /api/health`.

## Settings in the app

The JPEG quality and size of exports are chosen on the **Settings** page and stored in the database. They apply to every session. After you change them, the next export of a session renders all its photos again.

When a long edge is set, every export also gets one fixed, moderate level of RawTherapee's post-resize sharpening, which runs after the photo is scaled down. There is no setting for it: a full-size export gets none, because the photo's own sharpening already ran.

## Background cleanup

GiRAF cleans up after itself on start and then on a schedule:

- **Every hour:** unfinished uploads older than `UPLOAD_RESUME_HOURS`, receipts of finished uploads older than 30 days, and half-written chunk files in `IMPORT_DIR/.resumable`.
- **Every night (03:43 server time):** working folders older than an hour that interrupted renders left in `TMP_DIR`. Editor TIFFs and the develop cache are kept; the develop cache trims itself to `DEVELOP_CACHE_MAX_BYTES`.

## Hidden render settings

Every render removes hot pixels and isolated speckles (RawTherapee's impulse noise reduction at its default threshold). It is not part of the edit, so it does not appear in the editor, in versions or in copied settings.
