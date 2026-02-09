# RAW Editor

Web-based RAW photo editor that runs RawTherapee CLI in a container, so you can edit and export from low-power devices.

## Highlights

- RAW import with TIFF intermediates for fast preview generation
- Web-based PP3 editing with versioned snapshots
- Export to external integrations (Google Photos, Immich)
- Background import/export jobs per session
- Docker-first setup for self-hosting

## Quick start (Docker-first)

1) Copy the env file and edit values:

```bash
cp .env.example .env
```

2) Start the stack (app + Postgres):

```bash
docker compose -f docker-compose.selfhost.yml up -d --build
```

3) Open the UI:

- http://localhost:3000

## Configuration

- Edit `.env` for database and paths
- See `docs/DOCKER.md` for a full Docker setup
- See `docs/CONFIGURATION.md` for environment variables

## Development (Bun)

```bash
bun install
bun run dev
```

## Project structure

- `src/lib/server/image-editor.ts`: RawTherapee CLI wrapper
- `src/lib/pp3-utils.ts`: PP3 parse/diff/apply utilities
- `src/lib/server/db/schema.ts`: Drizzle schema
- `src/lib/server/jobs/`: job manager and workers

## License

Add a LICENSE file before publishing the repo.
