# Configuration

Copy `.env.example` to `.env` and adjust values.

## Required

- `DATABASE_URL`: PostgreSQL connection string
- `CLUT_DIR`: Directory containing LUT files for film simulation (source: http://rawtherapee.com/shared/HaldCLUT.zip)
- `IMPORT_DIR`: Directory watched for new RAW files
- `IMPORT_EXTRA_DIRS`: Optional extra directories to scan for RAW files, separated by `:` (uploads still land in `IMPORT_DIR`)
- `EXPORT_DIR`: Directory for exports
- `TMP_DIR`: Directory for temporary intermediates

## Optional

- `HOST_DOMAIN`: Domain name for Traefik routing (if using Traefik)
- `RAWTHERAPEE_VERSION`: RawTherapee release tag used when building the Docker image (defaults to latest)

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
- `DATA_DIR=/app/data` (optional, for token persistence)
