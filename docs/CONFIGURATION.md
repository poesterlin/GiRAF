# Configuration

Copy `.env.example` to `.env` and adjust values.

## Required

- `DATABASE_URL`: PostgreSQL connection string
- `CLUT_DIR`: Directory containing LUT files for film simulation
- `IMPORT_DIR`: Directory watched for new RAW files
- `EXPORT_DIR`: Directory for exports
- `TMP_DIR`: Directory for temporary intermediates

## Optional

- `HOST_DOMAIN`: Domain name for Traefik routing (if using Traefik)

## Docker defaults

When using `docker-compose.selfhost.yml`, the defaults are:

- `CLUT_DIR=/app/cluts`
- `IMPORT_DIR=/app/import`
- `EXPORT_DIR=/app/export`
- `TMP_DIR=/app/tmp`
