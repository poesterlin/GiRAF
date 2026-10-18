# Configuration

Copy `.env.example` to `.env` and adjust values.

## Required

- `DATABASE_URL`: PostgreSQL connection string
- `CLUT_DIR`: Directory containing LUT files for film simulation (source: http://rawtherapee.com/shared/HaldCLUT.zip)
- `IMPORT_DIR`: Directory watched for new RAW files
- `EXPORT_DIR`: Directory for exports
- `TMP_DIR`: Directory for temporary intermediates

## Optional

- `DATA_DIR`: Where the Google Photos sign-in is stored (defaults to `data` in the working directory, `/app/data` in Docker). Mount it as a volume so the sign-in survives rebuilds.
- `RENDER_CONCURRENCY`: Most RawTherapee processes to run at once (defaults to half the CPU cores, at least 2). Editor previews go ahead of imports and exports.
- `HOST_DOMAIN`: Domain name for Traefik routing (if using Traefik)
- `RAWTHERAPEE_VERSION`: RawTherapee release tag used when building the Docker image (defaults to latest)
- `IMPORT_EXTRA_DIRS`: Extra directories to scan for RAW files, separated by `:`. Uploads still land in `IMPORT_DIR`.
- `SD_CARD_IMPORT_PATH`: Host mount point of the SD card for automatic import (defaults to `/mnt/sdcard`)

### Automatic SD-card import

The `watchers` service polls the card's `DCIM` folder every few seconds, copies new photos into the import folder and starts an import. It is opt-in:

```bash
docker compose --profile sd-card up -d
```

Mount the card at `SD_CARD_IMPORT_PATH` on the host. A card mounted after the service starts is picked up too. Files already in the import folder at the same size are skipped, so reinserting a card or restarting the service does not copy them again.

### Integrations

- `IMMICH_BASE_URL`: Base URL of your Immich instance.
- `IMMICH_API_KEY`: API Key for Immich.
- `GOOGLE_CLIENT_ID`: OAuth 2.0 Client ID for Google Photos.
- `GOOGLE_CLIENT_SECRET`: OAuth 2.0 Client Secret for Google Photos.

## Docker defaults

When using `docker-compose.selfhost.yml`, the defaults are:

- `CLUT_DIR=/app/cluts`
- `IMPORT_DIR=/app/import`
- `EXPORT_DIR=/app/export`
- `DATA_DIR=/app/data` (mounted from `./data`, keeps the Google Photos sign-in)

## Export settings

The JPEG quality and size of exports are chosen on the **Settings** page and stored in the database. They apply to every session. After you change them, the next export of a session renders all its photos again.

## Temporary files

On start, GiRAF removes working folders older than an hour that interrupted renders left in `TMP_DIR`. Editor TIFFs and the develop cache are kept.
