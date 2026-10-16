# Intermediate representation for faster RawTherapee renders

## Problem

The editor shells out to `rawtherapee-cli` for every render. Each invocation starts from the
source RAW and repeats the whole pipeline: decode (`dcraw`/`libraw`), raw preprocessing, and
demosaicing, before any of the actual edit is applied. For the Fujifilm X-Trans files this app
imports, that prefix is a large, fixed cost that is identical between edits of the same photo.

This document records an investigation into a *develop base intermediate representation* (IR): a
full-resolution image built once from the RAW, then loaded on every later render so the decode and
demosaic stages are skipped.

## RawTherapee pipeline

The batch/CLI entry point is `rtgui/main-cli.cc`. It loads the source with
`rtengine::InitialImage::load` (`rtengine/loadinitial.cc`), which returns either a `RawImageSource`
(for RAW) or a `StdImageSource` (for TIFF/JPEG/PNG). `ProcessingJob::create` + `processImage`
(`rtengine/simpleprocess.cc`) then run the pipeline stages:

| Stage | Function | Notes |
| --- | --- | --- |
| decode RAW | `RawImageSource::load` | `dcraw`, the largest single prefix cost |
| preprocess | `ImageSource::preprocess` | dark/flat frames, bad pixels, raw crop |
| **demosaic** | `RawImageSource::demosaic` | X-Trans / Bayer interpolation, second largest |
| downstream | `stage_denoise`, `stage_transform`, `stage_finish` | WB, exposure, curves, denoise, resize, output ICC |

`ImageSource::demosaic` also has a `cache` argument and `RawImageSource` keeps
`redCache`/`greenCache`/`blueCache` (`rtengine/rawimagesource.cc:1796`). The GUI's
`StagedImageProcessor` (`rtengine/rtengine.h:720`, `rtengine/improccoordinator.cc`) uses that to
keep the demosaiced image in memory and re-run only the downstream stages as parameters change.
The CLI does not: every process starts cold.

Measured stage timings for `DSCF9951.RAF` (Fuji X-T4, 4160x6240, X-Trans) at full resolution with
RawTherapee 5.13 verbose logging:

```
Load /work/in/DSCF9951.RAF:        719553 usec   (0.72 s)
Preprocessing:                      68576 usec   (0.07 s)
Demosaicing X-Trans data: 3-pass:  354660 usec   (0.35 s)
```

So ~1.14 s of the ~2.3 s full-resolution render is the RAW-specific prefix.

## Why a TIFF is a usable IR

`InitialImage::load` treats `.tif`/`.tiff` as a non-raw `StdImageSource`. In `stage_init`
(`rtengine/simpleprocess.cc`), `imgsrc->preprocess` and `imgsrc->demosaic` become no-ops for a
standard image, and the downstream stages run unchanged. RawTherapee additionally has a built-in
"input reference" concept for DCP profiling — `ImProcCoordinator::saveInputICCReference`
(`rtengine/improccoordinator.cc:3330`) saves preprocess + demosaic + optional WB as a linear 16-bit
TIFF with no tone curve and no input profile.

The existing two-step app pipeline already produces exactly this shape of file: `generateExportTif`
runs the import profile (camera WB + auto exposure, resize disabled) to a full-resolution TIFF, and
`editImage` loads that TIFF and applies the edit. The only thing missing is *reuse* — the base is
rebuilt from the RAW on every export.

## What was evaluated

`scripts/ir-benchmark.sh` builds a base once and compares rendering from it against rendering the
RAW directly. Candidates considered:

1. **16-bit integer TIFF** (the app's existing base) — RT-native, 155 MB for a 26 MP X-Trans file.
2. **32-bit float TIFF** with `OutputProfile=No ICM: sRGB output` — intended as a linear base.
3. **16-bit float TIFF** — same, half the size of 32f.

Fidelity against a direct RAW render of the same edit profile (full resolution, PNG, PSNR over the
sRGB output):

| Base | PSNR vs direct RAW | Mean |
| --- | --- | --- |
| direct RAW (reference) | — | 109.2 |
| 16-bit integer TIFF | 31.5 dB | 105.2 |
| 16f float, `No ICM` output | 14.4 dB | 157.7 |
| 32f float, `No ICM` output | 14.4 dB | 157.7 |

Conclusions:

- The **integer TIFF base round-trips faithfully enough to be the app's base** (~31 dB against a
  direct render is dominated by the app already routing every render through a TIFF; it is not a
  regression introduced by caching).
- The **float "linear" base does not round-trip** through the CLI. `No ICM` still writes
  display-referred values and the float reader does not rescale the way the raw pipeline expects,
  so the round trip shifts the image by ~45/255. A faithful linear base would need either RT's
  GUI-only `saveInputICCReference` path or a small change to the RT core (serialize the
  `RawImageSource` `redCache`/`greenCache`/`blueCache` buffers).
- Rendering the same base twice is **byte-identical** (verified with a pixel diff); only rebuilding
  the base from RAW introduces tiny (~4/65535 on 0.002% of samples) multithreading noise.

## Result

For `DSCF9951.RAF` and `DSCF0339.RAF`, RawTherapee 5.13, 3 runs per scenario, fastest reported:

| Scenario | DSCF9951 | DSCF0339 |
| --- | --- | --- |
| direct RAW → JPEG | 2288 ms | 2323 ms |
| build develop base from RAW (once) | 2702 ms | 2649 ms |
| cached base → JPEG | 1619 ms | 1644 ms |
| **current export (build + render)** | **4321 ms** | **4293 ms** |
| **cached export (render only)** | **1619 ms** | **1644 ms** |
| speedup | **2.67x** | **2.61x** |

Base size is 155 MB per image at 16-bit full resolution. Every export after the first reuses the
base, so the build cost is amortized and repeated renders (editor refinement, re-export, thumbnails)
each save ~2.7 s.

## What was built

- **`src/lib/server/develop-cache.ts`** — a persistent, disk-backed, reference-counted cache of
  develop bases, keyed by RAW path + mtime + size. Entries are evicted by TTL and a total-size
  budget (`DEVELOP_CACHE_MAX_BYTES`, `DEVELOP_CACHE_TTL_MS`). Concurrent requests for the same RAW
  share one build. `generateExportTif` gained an `outputDir` option so bases can be written to the
  cache location.
- **Wired in** to the export job (`src/lib/server/jobs/executor.ts`), the download/render route
  (`src/routes/api/images/[id]/render/+server.ts`), and the editor's high-resolution preview path
  (`src/lib/server/editor-preview.ts`), replacing the previous in-memory-only cache (2 entries,
  10 minute TTL) with the persistent one.
- **`scripts/ir-benchmark.sh`** — standalone benchmark harness.
- **`src/lib/server/develop-cache.test.ts`** — unit tests for build-once, reuse, concurrency
  dedupe, source invalidation, and eviction.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `DEVELOP_CACHE_DIR` | `$TMP_DIR/develop-cache` | Where bases are stored. |
| `DEVELOP_CACHE_MAX_BYTES` | `6442450944` (6 GiB) | Total budget; least-recently-used entries are evicted. |
| `DEVELOP_CACHE_TTL_MS` | 604800000 (7 days) | Unused entries older than this are removed. |

Bases live on the `./tmp` volume. With a 155 MB base per image, the default 6 GiB budget holds
roughly 40 images; raise it (and the volume) to keep more photos warm.

## Reproduce

```sh
# Inside the editor container (rawtherapee-cli on PATH):
scripts/ir-benchmark.sh /app/import/photo.RAF /path/to/edit.pp3
```

## Trade-offs

- **Disk**: 155 MB per cached photo versus ~4 MB for the existing 1000 px preview TIFF. The cache is
  bounded and evicts LRU, but it is the main cost.
- **Staleness**: the base bakes camera WB, demosaic and auto exposure at build time. Edits that only
  change downstream tools (tone curve, levels, colour, LUTs, crop, resize, sharpening) are unaffected.
  Changing WB or demosaic *from the raw* is not possible once a base exists; the source mtime/size
  key forces a rebuild if the file changes.
- **Correctness**: the base is exactly what the app already renders through, so caching changes no
  pixels. A future RT-core change could serialize the demosaiced buffers for a fully flexible IR.
