This file provides guidance to AI Agents when working with code in this repository.

## Project Overview

Web-based RAW photo editor that uses RawTherapee CLI for remote-controlled RAW image editing from low-power devices. Built with SvelteKit 5, Bun runtime, PostgreSQL + Drizzle ORM, and TailwindCSS 4.

The application imports RAW images, generates TIFF intermediates and preview images, allows web-based editing via PP3 configuration files, and exports to external integrations (Google Photos, Immich).

## Development Commands

### Running the Application

```bash
# Development server (uses Bun)
bun run dev

# Build for production
bun run build

# Preview production build
bun run preview
```

### Database

```bash
# Start PostgreSQL via Docker Compose
bun run db:start

# Push schema changes to database (development)
bun run db:push

# Generate migrations from schema
bun run db:generate

# Run migrations
bun run db:migrate

# Open Drizzle Studio (database GUI)
bun run db:studio
```

### Code Quality

```bash
# Type checking
bun run check

# Watch mode for type checking
bun run check:watch

# Format code
bun run format

# Lint (runs Prettier check + ESLint)
bun run lint
```

## Architecture

### PP3 File System

The core editing mechanism uses RawTherapee's PP3 files (text-based configuration format):

- **Base PP3**: Template file in `src/lib/assets/` (import.pp3, export.pp3, client.pp3, base.pp3)
- **PP3 Utils** (`src/lib/pp3-utils.ts`): Parse, stringify, diff, apply, filter PP3 files
- **Snapshots**: Each edit state is saved as a PP3 string in the database (snapshot table)
- **Image Editor** (`src/lib/server/image-editor.ts`): Wraps `rawtherapee-cli` to apply PP3 to RAW files

The PP3 format is parsed into a typed object structure `PP3 = Record<string, Record<string, string | number | boolean>>`, where top-level keys are "chapters" (sections like `White_Balance`, `Film_Simulation`) and nested keys are settings.

### Data Model (Drizzle ORM)

Schema in `src/lib/server/db/schema.ts`:

- **Session**: Groups images from an import session (e.g., a photoshoot)
- **Image**: RAW file metadata, preview path, TIFF path, EXIF data, rating, tags, stacking
- **Snapshot**: Versioned PP3 edits for an image (multiple snapshots per image)
- **Import**: Tracks files pending import
- **Tag**: User-created tags with many-to-many relationship to images
- **Profile**: Saved PP3 presets that can be applied to images
- **Album**: External integration albums (Google Photos, Immich)
- **Media**: Links images to external album items

Key relationships:
- Images belong to Sessions
- Images have many Snapshots
- Images can be stacked (stackId self-reference, isStackBase flag)
- Images have perceptual hash (phash) for duplicate detection

### Job System

Background job processing for long-running operations (`src/lib/server/jobs/`):

- **JobManager** (singleton): Manages import/export jobs, one active job per session
- **JobType**: `IMPORT` (RAW → database), `EXPORT` (database → external integrations)
- Jobs are keyed by sessionId, support cancellation via AbortController
- Jobs run in-process (not a separate queue worker)

### External Integrations

Photo storage integrations (`src/lib/server/integrations/`):

- **PhotoIntegration interface**: Common API for uploading, creating albums, managing media
- **Google Photos**: OAuth2 flow, uses Google Photos Library API
- **Immich**: Self-hosted photo management integration
- Each integration implements: configure, createAlbum, uploadFile, addToAlbum, removeFromAlbum, replaceInAlbum

### Image Processing Workflow

1. **Import**: RAW file → generate TIFF with `generateImportTif()` → extract EXIF → create preview → save to database
2. **Edit**: User adjusts PP3 settings in UI (Svelte reactive state) → throttled preview regeneration via worker → save snapshot
3. **Export**: Job reads images + snapshots → renders final JPEG with PP3 → uploads to integration → tracks in Media table

### State Management (Svelte 5)

- **editing.svelte.ts**: Global reactive state for current image PP3, undo/redo history, throttled updates
- **tag.svelte.ts**: Tag autocomplete and management
- **app.svelte.ts**: App-level state
- Uses Svelte 5 runes (`$state`, `$derived`, `$effect`)

### RawTherapee CLI Integration

Commands are executed via `runCommand()` in `src/lib/server/command-runner.ts`:

- **Edit image**: `rawtherapee-cli --no-gui -p <pp3> -o <output> -j<quality> -Y -c <input>`
- **Generate TIFF**: `rawtherapee-cli --no-gui -p <pp3> -b16 -t -O <outdir> -Y -c <input>`
- Supports AbortSignal for cancellation
- Uses temp directories for intermediate files

### Worker for Client-Side Preview

`src/lib/worker.ts`: Web Worker (via Comlink) for fetching preview images without blocking UI. Debounces requests and caches results.

## Key Conventions

- **Bun runtime**: Package manager and dev server (not Node.js)
- **Svelte 5 syntax**: Use runes (`$state`, `$derived`, `$effect`) not legacy stores
- **Database queries**: Use Drizzle ORM relational queries, not raw SQL
- **File paths**: Environment variables for directories (IMPORT_DIR, EXPORT_DIR, TMP_DIR, CLUT_DIR)
- **Error handling**: Commands reject on non-zero exit code with full stdout/stderr
- **PP3 editing**: Always parse → modify object → stringify, never manipulate strings directly

## Environment Variables

Required in `.env` (see `.env.example`):

- `DATABASE_URL`: PostgreSQL connection string
- `CLUT_DIR`: Directory containing LUT files for film simulation
- `IMPORT_DIR`: Directory watched for automatic imports
- `EXPORT_DIR`: Directory for exported images
- `SD_CARD_IMPORT_PATH`: Optional path to SD card mount for auto-import
- `HOST_DOMAIN`: Domain for Traefik routing (production)

## Docker Deployment

Two services in `docker-compose.yml`:

1. **editor**: Main SvelteKit app (Node adapter), port 3000
2. **watchers**: Separate service running file watchers for SD card import

Both share volumes for import/export directories and CLUT files.