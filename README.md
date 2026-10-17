<div align="center">

<img src="src/lib/assets/logo.webp" alt="GiRAF logo" width="96" />

# GiRAF

**Develop your RAW photos from any browser, on your own server.**

Import, cull, edit and publish your photos in one self-hosted workflow, powered by [RawTherapee](https://rawtherapee.com/).
Your tablet or laptop just needs a browser; the server does the heavy lifting.

[![Latest version](https://img.shields.io/github/v/tag/poesterlin/giraf?label=version&sort=semver)](https://github.com/poesterlin/giraf/tags)
[![Docker image](https://github.com/poesterlin/giraf/actions/workflows/docker-publish.yml/badge.svg)](https://github.com/poesterlin/giraf/pkgs/container/giraf)
[![License: GPL v3](https://img.shields.io/badge/license-GPLv3-blue.svg)](LICENSE)

[Quick start](#quick-start) · [Features](#features) · [Screenshots](#screenshots) · [Integrations](#integrations) · [Roadmap](#roadmap)

<br />

<img src="docs/images/3-editor.png" alt="The GiRAF editor with a before/after split of hot-air balloons over Cappadocia" width="900" />

</div>

## Why GiRAF?

Editing RAW files usually means a powerful desktop and a library that lives on it. GiRAF moves both to your server. Your photos stay in one place you control. Any device with a browser, even a low-power tablet on the couch, becomes a full RAW editor, and finished photos go straight to Immich or Google Photos.

## How it works

| | Step | What you do |
|:-:|---|---|
| 📥 | **Import** | Drop RAW files into a watched folder, upload them from your device, or let an SD card import itself. |
| 🗂️ | **Cull** | Flip through a session in Triage, compare similar shots and archive the ones you don't want. |
| 🎨 | **Develop** | Edit with before/after comparison, film looks, masks and versioned snapshots. |
| 🚀 | **Publish** | Export to Immich or Google Photos, or download finished sessions as ZIP files. |

## Features

**Editing**
- **Non-destructive adjustments:** exposure, black and white point, white balance, tone curves, color mixer, color grading, black & white, clarity, noise reduction, sharpening and vignette.
- **Film looks:** browse film simulation LUTs (hundreds with the Hald CLUT pack), each previewed on your own photo.
- **Local tools:** crop and rotate, local masks and spot retouching.
- **Automatic lens correction:** distortion, vignetting and chromatic aberration are corrected on import using lensfun.
- **Room to experiment:** undo/redo, before/after comparison, versioned snapshots and reusable profiles.

**Workflow**
- **Sessions:** photos are grouped into sessions with mosaic covers, sorting and an archive.
- **Triage:** cull before you edit and stack similar shots together.
- **Flexible import:** scan your import folder and any extra folders, upload from the browser or command line, or copy new photos from an SD card automatically.
- **Background jobs:** imports and exports run on the server with progress notifications.

**Built for small devices**
- **Touch-friendly:** the editor works on phones and tablets as well as on desktops.
- **Light on the network:** quick previews appear first and sharpen when the connection allows.
- **Self-hosted:** one Docker Compose file runs the app and PostgreSQL.

## Screenshots

<table>
  <tr>
    <td width="50%"><img src="docs/images/2-gallery.png" alt="Gallery with session cards" /><p align="center"><b>Gallery</b>: sessions at a glance</p></td>
    <td width="50%"><img src="docs/images/2-session.png" alt="A session's photos in a grid" /><p align="center"><b>Session</b>: every photo in a shoot</p></td>
  </tr>
  <tr>
    <td><img src="docs/images/3-luts.png" alt="Film look picker with previews" /><p align="center"><b>Looks</b>: film simulations previewed on your photo</p></td>
    <td><img src="docs/images/1-import.png" alt="Importer with selected photos" /><p align="center"><b>Import</b>: pick what to bring in</p></td>
  </tr>
  <tr>
    <td><img src="docs/images/4-export.png" alt="Exporter with sessions ready to publish" /><p align="center"><b>Export</b>: publish to your photo services</p></td>
    <td align="center"><img src="docs/images/3-editor-mobile.png" alt="The editor on a phone" width="45%" /><p align="center"><b>Mobile</b>: the full editor on a phone</p></td>
  </tr>
</table>

## Quick start

You need Docker with Docker Compose.

```bash
mkdir giraf && cd giraf
curl -O https://raw.githubusercontent.com/poesterlin/giraf/main/docker-compose.selfhost.yml
touch .env
docker compose -f docker-compose.selfhost.yml up -d
```

Open [http://localhost:4893](http://localhost:4893), or `http://<your-server-address>:4893` from another device on your network.

Then:
- Put RAW files in `./import` and press **Scan Directory**, or use **Manual Upload** in the importer.
- Find local exports in `./export`.
- *Optional:* for film looks, download the [Hald CLUT pack](http://rawtherapee.com/shared/HaldCLUT.zip) and unzip it into `./cluts`.

## Configuration

- Database settings and storage paths live in `docker-compose.selfhost.yml`.
- Environment variables, extra import folders and automatic SD-card import are described in [docs/CONFIGURATION.md](docs/CONFIGURATION.md).
- Uploading from devices is covered in [docs/local-imports.md](docs/local-imports.md), and uploading from the command line in [docs/raw-upload-cli.md](docs/raw-upload-cli.md).

## Integrations

GiRAF exports finished photos straight into your photo library.

<details>
<summary><b>Immich</b></summary>

1. Create an **API key** in your Immich user settings.
2. Add it to your `.env`:
   ```bash
   IMMICH_BASE_URL=https://immich.example.com
   IMMICH_API_KEY=your-api-key
   ```

</details>

<details>
<summary><b>Google Photos</b></summary>

1. Create a project in the [Google Cloud Console](https://console.cloud.google.com/).
2. Enable the **Photos Library API**.
3. Create an **OAuth 2.0 Client ID** of type *Web application*.
4. Add your GiRAF URL followed by `/api/auth/google/callback` as a **redirect URI**, for example `https://photos.example.com/api/auth/google/callback`.
5. Add the credentials to your `.env`:
   ```bash
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   ```

GiRAF saves the Google tokens to `/app/data/google_tokens.json` inside the container. The self-hosting compose file already maps `./data:/app/data` so they survive restarts. If you use your own compose file, add the same volume:

```yaml
services:
  editor:
    volumes:
      - ./data:/app/data
```

</details>

## Roadmap

- [ ] User authentication
- [ ] Import folders configurable in the UI

<details>
<summary>Already shipped</summary>

- [x] Automatic lens corrections (lensfun, applied on import)
- [x] White point and black level controls
- [x] Multiple import folders (`IMPORT_EXTRA_DIRS`)
- [x] Automatic SD-card import (opt-in `sd-card` compose profile)
- [x] Progressive editor previews (a quick preview that refines on capable devices and connections)
- [x] Crop, local masks and spot retouching
- [x] Tone curves, color mixer and color grading
- [x] Vibrance controls
- [x] Undo/redo
- [x] Processing notifications

</details>

## License

GiRAF is free software under the [GNU GPL v3](LICENSE).
