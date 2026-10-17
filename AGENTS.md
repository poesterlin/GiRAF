Guidance for anyone working on this repository, human or AI agent.

## Project

GiRAF is a self-hosted RAW photo editor. The browser edits, and the server renders with `rawtherapee-cli`.

Stack: SvelteKit 5, Bun, PostgreSQL with Drizzle ORM, TailwindCSS 4.

## Commands

```bash
bun run dev       # development server
bun run check     # type check (svelte-check)
bun test          # unit tests
bun run lint      # Prettier check + ESLint
bun run format    # format with Prettier
bun run build     # production build

bun run db:push      # apply schema changes (development)
bun run db:generate  # create a migration from the schema
bun run db:migrate   # run migrations
```

Run `bun run check` and `bun test` before you hand in a change.

## How it works

- **Edits are PP3 files.** RawTherapee's text format is parsed into `PP3 = Record<chapter, Record<key, value>>` by `src/lib/pp3-utils.ts`. Each saved edit is a snapshot row holding a PP3 string.
- **Import** develops each RAW once into a TIFF with `src/lib/assets/import.pp3`, which also applies lens correction. The profile used is saved as `edit.pp3` beside the TIFF.
- **Previews and exports** render from developed TIFFs, never from the RAW. Settings RawTherapee only applies to RAWs, such as `[RAW]` and `[LensProfile]`, have no effect in an edit.
- **Develop bases** in `src/lib/server/develop-cache.ts` are cached full-size TIFFs for exports and large previews. They reuse each photo's recorded profile, so a photo always keeps the look it was edited with.
- **Jobs** for import and export run in-process from `src/lib/server/jobs/`, one per session, and can be cancelled.
- **Integrations** for Immich and Google Photos live in `src/lib/server/integrations/`.
- **The schema** is in `src/lib/server/db/schema.ts`.

## Conventions

- Use Bun, not Node or npm.
- Use Svelte 5 runes (`$state`, `$derived`, `$effect`), not stores.
- Use Drizzle relational queries, not raw SQL.
- Edit PP3 by parsing, changing the object and stringifying. Never edit PP3 text directly.
- Take directories from environment variables (`IMPORT_DIR`, `EXPORT_DIR`, `TMP_DIR`, `CLUT_DIR`).
- Keep pages fast on slow connections:
  - Any `<img>` repeated in a list or grid uses `loading="lazy"` and a thumbnail (`/api/images/:id/preview?size=…`).
  - Only the photo on screen and its direct neighbours may load eagerly.
  - Send only the fields a page needs. Never send bulky columns such as `importBaseline` for a whole list.

Settings and environment variables are documented in [docs/CONFIGURATION.md](docs/CONFIGURATION.md).

## Maintainer deployment

This applies only on the maintainer's deployment server. Contributors can skip it.

On that server, deploy after finishing a change, unless asked not to. Only treat the machine as the deployment server when the user or the environment says so. Having Docker or these compose files is not enough. If unsure, don't deploy, and say so.

```bash
docker compose -f docker-compose.yml -f compose.deploy.yaml up -d --build --wait --wait-timeout 180 editor
```

Use the same two compose files for logs and status.
