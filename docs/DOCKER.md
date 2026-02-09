# Docker Setup

This is the recommended deployment path for self-hosting.

## Prerequisites

- Docker Engine + Compose v2
- At least 4 GB RAM recommended
- Plenty of disk for RAW + TIFF intermediates

## Quick start

```bash
cp .env.example .env

docker compose -f docker-compose.selfhost.yml up -d --build
```

UI: http://localhost:3000

## Updating

```bash
docker compose -f docker-compose.selfhost.yml pull

docker compose -f docker-compose.selfhost.yml up -d
```

## Troubleshooting

- If previews fail, ensure the RawTherapee CLI is available in the image (the default Dockerfile installs it).
- If database errors occur, verify `DATABASE_URL` in `.env` and that the `db` service is healthy.
- For permissions issues, ensure `./import`, `./export`, and `./tmp` are writable by Docker.
