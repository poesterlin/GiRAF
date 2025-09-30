# Assistant Guide for the Raw Editor Project

This document provides guidance for AI assistants working on this project. It outlines the project's architecture, conventions, and the developer's workflow. Adhering to these guidelines will ensure smooth and efficient collaboration.


## Workflow

unfortunately there is currenlty a bug where files are not properly refreshed so its hard to edit them. If you get this error:
```
    Failed to edit, 0 occurrences found for old_string. No edits made. The exact text in old_string was not found. Ensure you're not escaping content incorrectly and check whitespace, indentation, and context. Use read_file tool to verify.     
``` 
The solution is just to create a new file next the one your trying to edit. that way i can copy it in.

## Project Overview

This project is a web-based photo editor application for processing RAW image files. It is built with SvelteKit and utilizes Svelte 5. In the production environment its going to be containerized.  

-   **Frontend**: Svelte 5, SvelteKit, Tailwind CSS
-   **Backend**: SvelteKit API routes, Drizzle ORM
-   **Database**: PostgreSQL
-   **Core Features**:
    -   **Gallery**: Displays image sessions in a paginated view.
    -   **Editor**: The core image editing interface (details are in `/[img]`).
    -   **Exporter**: Lists sessions with changes and allows exporting them.
    -   **Importer**: A file-watcher service automatically detects new images in a designated directory and adds them to an import queue. A dedicated page at `/importer` displays these pending imports with lazy-loaded previews.

## Development Workflow & Conventions

The developer has a specific workflow. It's crucial to understand and follow it to avoid rework.

1.  **Incremental Implementation**: The developer often provides a basic structure or a starting point and expects the assistant to complete the implementation based on that.
2.  **Rebasing on User Changes**: The developer may update files while the assistant is working. If a file modification fails, it's likely because the developer has changed the file. **Always re-read the file and adapt your changes to the new structure.** The developer prefers to revert the assistant's changes and have the assistant re-apply them to the new structure.
3.  **Component-Driven Structure**: The developer is moving towards a structure where complex views are broken down into components. A key example is the use of a generic `Scroller.svelte` component for paginated lists.

### Package Manager

Always use **bun** for package management. Do not use npm or yarn. The developer always has a bun dev server running. Do not stop it. Do not run any other dev server. Do not try to update the database schema or run migrations. The developer will handle that.

### Background Services & Scripts

The project uses `concurrently` to run background services alongside the main web server during development. This is configured in `package.json`.

-   **File Watcher**: A script at `src/scripts/watch-and-import.ts` uses `chokidar` to monitor a directory (configured via `IMPORT_DIR` in `.env`) for new images.

## Frontend Conventions

### Styling
-   **Theme**: The application uses a dark, grayscale, and expressive theme optimized for touch interactions.
-   **Framework**: Styling is done exclusively with **Tailwind CSS**.
-   **Color Palette**: Use the `neutral` color palette from Tailwind CSS (e.g., `bg-neutral-900`, `text-neutral-200`). Avoid custom CSS variables or other colors unless for specific expressive elements like status indicators (e.g., yellow for "Updated").

### Component Architecture
-   **Lists & Pagination**: For lists of data (like in the Gallery and Exporter), the project uses a central `Scroller.svelte` component.
-   **Snippets**: This `Scroller` component uses **Svelte 5 snippets** for rendering. When building or modifying lists, conform to this pattern by defining `#snippet` blocks for `item`, `empty`, and `footer`.
-   **Empty States**: Provide visually appealing and informative empty states for any list or data view that can be empty.

## Backend & Data Conventions

### Data Loading
-   **SSR First**: All data for pages is loaded on the server within `+page.server.ts` files.
-   **API Endpoints**: The `load` functions in `+page.server.ts` should not contain direct database logic. Instead, they should `fetch` from internal API routes located under `/src/routes/api/`.

### API Route Design
-   **Separation**: Each data type should have its own API route (e.g., `/api/sessions`, `/api/exporter/sessions`).
-   **Pagination**: API endpoints for lists must be paginated. The current approach uses a cursor/offset system (`/api/sessions?cursor=...`). The API response for a list should include the `sessions` (or other data) array and a `next` property for the next cursor.
-   **Database Logic**: The API routes are the only place where direct database queries should be made.

### Import Process

The application features an automated import pipeline:

1.  A file watcher (`src/scripts/watch-and-import.ts`) detects new image files in the `IMPORT_DIR`.
2.  Instead of creating a session directly, it adds a record to the `importTable`, queuing the file for user review.
3.  The `/importer` page fetches this queue from the `/api/importer/sessions` endpoint.
4.  Preview images are served dynamically via the `/api/importer/image/[id]` endpoint, which reads the file path from the database and returns the image data.

### Database
-   **ORM**: The project uses **Drizzle ORM**.
-   **Schema**: The database schema is defined in `/src/lib/server/db/schema.ts`.
-   **Naming Conventions**:
    -   Table variables should be camelCase and end with `Table` (e.g., `sessionTable`).
    -   Relation variables should be camelCase and end with `Relations` (e.g., `sessionRelations`).
-   **Queries**: Use the Drizzle query API (e.g., `db.query.sessionTable.findMany(...)`) for all database access.

## Docker Development Environment

The application is designed to run in a containerized environment using Docker Compose.

-   **Volume Mapping**: To allow services inside the container to access files on the host machine (like the image import directory), directories are mapped as volumes in `docker-compose.yml`. For example, the `./import` directory on the host is mapped to `/app/import` inside the container.
-   **Concurrent Processes**: The main service runs both the SvelteKit server and any background scripts (like the file watcher) using `concurrently`. This is triggered by the `dev` script in `package.json`.

By following these guidelines, you can effectively contribute to the project in a way that aligns with the developer's established patterns and expectations.

## Recent Changes

### SD Card Importer Service

A new standalone service has been introduced to automatically import photos from an SD card. This service is defined in `src/scripts/sd-card-importer.ts` and runs in its own Docker container, configured by `Dockerfile.watchers`. The main `docker-compose.yml` file has been updated to include this new `watchers` service, which polls a specified `SD_CARD_IMPORT_PATH`. When new images are found, it copies them to a shared `import` volume and triggers the main application's import process via an API call.
