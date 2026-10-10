# TIFF preview parity

Production previews use the validated native subset and transparently fall back
to RawTherapee for unsupported tools or color profiles. The harness invokes native
exports directly, bypassing fallback so processing defects cannot be hidden.
No user-interface engine indicator is added.

## Current results

The installed source revision is `84b8cc08a04bdb0139d6e7421ad2e0d67309742c`.
The final expanded RGB8/RGB16/compressed-RGB16 corpus, tagged with RT 5.12's
RTv4 sRGB profile, passed **99/99 cases** in practical perceptual mode.
Report: `/tmp/opencode/preview-complete-expanded/report.html`.

On the 16-bit fixture, representative mean ΔE00 improved from roughly 10.84 to
0.04 for +1 EV, 11.07 to 0.07 for 4500 K WB, and 5.23 to 0.08 for auto exposure.
Five-degree straightening measures approximately 1.04 mean / 4.97 p95, with 1.38%
of pixels above 10. These are measured corpus results, not universal visibility
guarantees. Historical failures below describe earlier artifacts.

## Native source and builds

The native source is <https://github.com/poesterlin/rt-wasm>, checked out at
`../rt-wasm`. Run `bun run wasm:build` to compile and install compatible artifacts;
the generated `static/rt-wasm-source.json` records the Git revision, local-change
status, build mode, and artifact hashes. `RT_WASM_SOURCE_DIR` overrides the source
location. Building does not approve native output for production previews.

After recovering the source, the LUT function's argument order was corrected:
`(tiff, size, pp3, clut, clutElementCount, cubeDimension, quality)`. The earlier
out-of-bounds failures were caused by passing quality fourth. A corrected 36-case
synthetic run had **11 passes, 25 parity/dimension failures, and no render errors**;
all eight requested LUT-strength/disabled cases passed. Report:
`/tmp/opencode/preview-parity-corrected-api/report.html`.

Run the standalone harness with Bun from the repository root. No web server or database is required. It invokes the bundled `static/rt-wasm.js` / `.wasm` exports directly and compares their JPEG output against native RawTherapee processing of **the same TIFF**.

```sh
bun scripts/preview-parity/index.ts --rt rawtherapee-cli --out /tmp/opencode/parity photo.tif other.tiff

# Use an existing image containing rawtherapee-cli; creates disposable containers only.
bun scripts/preview-parity/index.ts --docker-image raw-editor-editor:latest \
  --out /tmp/opencode/parity photo.tif

# Include a Hald PNG film simulation; no LUT scenario is requested without --lut.
bun scripts/preview-parity/index.ts --docker-image raw-editor-editor:latest \
  --lut /absolute/path/film.png --pp3 src/lib/assets/client.pp3 photo.tif

bun test scripts/preview-parity/metrics.test.ts scripts/preview-parity/perceptual.test.ts

# Practical perceptual acceptance (also the defaults); fractions are 0–1.
bun run preview:parity --synthetic --docker-image raw-editor-editor:latest \
  --max-mean-delta-e00 3 --max-p95-delta-e00 7 --max-fraction-above-10 0.05
# Reproduce the original RGB acceptance criteria.
bun run preview:parity --synthetic --docker-image raw-editor-editor:latest --mode strict

# No external image needed: deterministic 128×96 RGB 8/16-bit TIFFs.
bun run preview:parity --synthetic --docker-image raw-editor-editor:latest
# Add --grayscale to also generate a 16-bit single-channel TIFF.
```

Suggested package script: `"preview:parity": "bun scripts/preview-parity/index.ts"`.

Use an unconfined Bun installation if the Snap build cannot access Docker. In this environment `/home/lab/.bun/bin/bun` works; `/snap/bin/bun` cannot see `/usr/bin/docker`.

## Scenarios and reference

The default profile is `src/lib/assets/client.pp3`; `--pp3` accepts another profile. Profiles are parsed, modified, and serialized with `src/lib/pp3-utils.ts`. **`application-profile` uses the exact parsed profile without normalization**, preserving auto exposure and Camera white balance. Every other scenario starts independently from a normalized copy with auto exposure disabled, exposure compensation zero, custom white balance at 6504 K / Green 1, and film simulation disabled. Scenarios change:

| Scenario             | Change                                |
| -------------------- | ------------------------------------- |
| baseline             | No additional change                  |
| exposure             | +1 EV                                 |
| wb                   | 4500 K                                |
| tint                 | Green 1.2                             |
| contrast             | Contrast 25                           |
| lut (when requested) | Film simulation enabled, strength 100 |

The expanded corpus also includes auto exposure with Clip 0.02% and 0.1%, −1 EV, WB 8500 K (`wb-warm`; the 4500 K case is named `wb-cool`), Green 0.8, Contrast −25, Saturation +25, coarse rotation 90°, a centered half-width/half-height crop, USM sharpening radius 0.8 / amount 100, and requested LUT strengths 0/50/100 plus disabled. The application-profile case intentionally retains all original settings and is not evidence-equivalent to normalized baseline.

Synthetic fixtures include an Adobe-Deflate-compressed RGB16 TIFF whose decoded
samples are tested against its uncompressed equivalent. Lower-bit values are
preserved; they are not constructed by expanding an 8-bit image.

A passing visual comparison is not proof that a tool is implemented: for example,
ignored sharpening can look close on a simple fixture. Capability coverage and
detail-rich real photographs are still required before approving production use.

`--synthetic` generates deterministic uncompressed TIFFs directly, retaining exact 8-bit/16-bit sample depth. They contain multichannel gradients, black/white and primary-color patches, near-clipping values and middle gray. Optional `--grayscale` adds single-channel 16-bit coverage. Files live only in the report directory; no user images are committed.

Both renderers use JPEG quality 85. The reference command is `rawtherapee-cli -o reference.jpg -j85 -js1 -q -p reference.pp3 -Y -c input.tif`; JPEG subsampling is explicitly matched to the bundled preview. Native rendering uses one OpenMP thread. Docker uses a new network-disabled container per command, with the report directory mounted at `/parity`, the current UID/GID, and a writable temporary HOME. It does not exec into or modify running services. The image must already contain RawTherapee; the harness does not install tools. Reference `--version` accepts exit 2 because RT 5.12 uses that exit status for version output.

LUT decoding uses the shared `src/lib/server/clut.ts` `loadClut()` loader and the existing `_tiff_to_jpeg_with_pp3_and_clut` WASM export. Missing runtimes, malformed input/LUT, unsupported exports, failed renders, and failed commands are errors, never fallback successes.

## Reports and acceptance

Each run writes `report.json` and a self-contained local `report.html` linking side-by-side WASM/reference JPEGs and a PNG heatmap. Each scenario retains its input TIFF, both serialized profiles, and reference stdout/stderr. Use a **new output directory per run**. Docker profile paths are translated to the mount path; both renderers receive the same LUT bytes.

JSON records SHA-256 hashes for bundled JS/WASM, input TIFFs, source PP3 and optional LUT, alongside native RT version output. Per-case errors retain the case name and renderer. A WASM failure still attempts native rendering; the broken module is discarded and recreated for the next case. Dimension failures are persisted immediately through the same per-case reporting path. Cases continue after failures when possible; operational failures still force exit 2.

Decoded images are converted to 8-bit sRGB RGB using Sharp. MAE and RMSE average all RGB channel errors on the 0–255 scale. PSNR is `20 log10(255 / RMSE)`; JSON `null` denotes infinite PSNR for identical images. Percentiles p50/p95/p99 and max use each pixel's **maximum absolute RGB channel error**, with nearest-rank percentiles. Heatmap red is `min(255, error × 8)`, green `min(255, error × 2)`, blue zero. It is an amplified diagnostic, not the unscaled difference.

Per-pixel perceptual differences use **CIEDE2000 (ΔE00)** with unit weighting factors: sRGB transfer-function decoding → linear RGB → XYZ D65 → Lab D65. Sharp's `toColourspace('srgb')` normalizes decoded output (including embedded ICC profiles handled by Sharp/libvips) before comparison; untagged RGB is treated as sRGB. No D50 adaptation is applied to these D65 Lab values. `metrics.perceptual` reports meanDeltaE00, nearest-rank p50/p95/p99/max, and fractionAbove2/5/10 (strictly greater than the cutoff, fractions 0–1).

Default `--mode perceptual` requires **mean ΔE00 ≤ 3, p95 ≤ 7, and fraction above 10 ≤ 0.05 (5%)**. Configure with `--max-mean-delta-e00`, `--max-p95-delta-e00`, and `--max-fraction-above-10`. These practical, relaxed thresholds are an engineering choice for previews. Roughly, ΔE00 around 2 can be barely noticeable in side-by-side viewing, 5 clearly noticeable, and 10 a large difference. These are not absolute percentages or visibility guarantees: display calibration, viewing conditions, image context and spatial structure matter. Inspect the side-by-side screenshots/JPEGs at matched zoom, especially faces, clipping and localized defects; aggregate pixel statistics cannot establish human equivalence.

`--mode strict` retains the original RGB acceptance: MAE ≤ 2, RMSE ≤ 3, PSNR ≥ 38 dB, p99 ≤ 10, configurable with `--max-mae`, `--max-rmse`, `--min-psnr`, `--max-p99`. Both metric sets and both diagnostic pass results are always recorded; the selected mode controls harness acceptance. The heatmap remains the amplified RGB diagnostic above. Dimension differences always fail; images are never resized to hide discrepancies. Missing outputs and render errors cannot pass either mode. Exit codes: **0** all requested scenarios pass; **1** parity/dimension failure; **2** runtime/input/render error. Operational errors are recorded in the reports, including partial completed results. This harness change does not change the production eligibility gate.

## Verified local reference

With bundled WASM and native RT 5.12 from `raw-editor-editor:latest`, on `/home/lab/projects/services/rt-wasm/test/fixtures/sample_640x426.tiff`:

| Scenario |    MAE |   RMSE | PSNR dB | p99 | Strict result |
| -------- | -----: | -----: | ------: | --: | ------------- |
| baseline |  0.058 |  0.317 |   58.11 |   2 | PASS          |
| exposure | 30.400 | 39.558 |   16.19 |  81 | FAIL          |
| wb       | 24.082 | 34.756 |   17.31 |  92 | FAIL          |
| tint     |  4.281 |  5.605 |   33.16 |  17 | FAIL          |
| contrast |  2.723 |  4.087 |   35.90 |  21 | FAIL          |

This historical strict-mode run correctly exited 1. Its RGB-only report cannot establish perceptual-mode acceptance; rerun to obtain ΔE00 statistics. Timing fields are diagnostic wall-clock durations, include output I/O and Docker startup for reference, and are not a speed benchmark.

A second run requesting `HaldCLUT/Negative.png` through the shared loader completed the five non-LUT scenarios, then the bundled `_tiff_to_jpeg_with_pp3_and_clut` export trapped with `Out of bounds memory access`. It correctly exited 2 and recorded the error in `/tmp/opencode/preview-parity-lut/report.json`; no LUT parity claim is made.

Expanded synthetic verification (28 cases across 8/16-bit RGB) exited 1: normalized baselines passed, exact application-profile failed with MAE 16.618/16.390, and rotation/crop dimensions failed explicitly. Report: `/tmp/opencode/preview-parity-synthetic-expanded/report.html`. The expanded 16-bit LUT run exited 2: strengths 50 and 100 trapped, native JPEGs were still produced, subsequent cases continued after module recreation, and strength 0 / disabled passed. Report: `/tmp/opencode/preview-parity-lut-expanded/report.html`. Fixture-depth/content and profile-independence tests join metric tests: 4 tests, 28 assertions passed.

## Scope limits

This compares bundled WASM against native RawTherapee, bypassing application eligibility routing and server fallback. It deliberately reveals unsupported/approximate preview behavior. A matching baseline alone does not establish slider parity. One synthetic fixture does not establish parity for all imported TIFF encodings, profiles, ICC transforms, dimensions, clipping, or LUTs; use a representative corpus and inspect reports.

The production gate in `src/lib/preview-parity-policy.ts` is currently **true** for
the validated subset. Unsupported active tools and unverified TIFF profiles still
use the reference renderer. Dehaze defaults to disabled in the editor; older
profiles with enabled Dehaze at exactly zero strength are also eligible, provided
they contain only recognized Dehaze fields and do not request a depth map.
RawTherapee 5.13's `ImProcFunctions::dehaze` returns immediately at zero strength,
so this does not add active Dehaze processing to the WASM renderer. Nonzero
Dehaze remains reference-only.

Enabled Vibrance is also eligible when Pastels and Saturated are explicitly zero
and the skin-tone curve is absent or `0;` (identity), with only recognized fields.
RawTherapee 5.13 returns before processing in this neutral case. Active Vibrance
and custom skin-tone curves remain reference-only.

The browser starts WASM initialization, TIFF download/profile validation and
required LUT loading concurrently to reduce cold-preview waiting time.

## Calibration extension (RawTherapee 5.13)

The lightweight renderer now parses Channel Mixer rows and applies them in
linear working RGB before highlight/exposure and shadow/tone processing. Browser
routing accepts recognized fields with complete three-integer rows, where each
coefficient differs from the identity matrix by at most 100 (PP3 units).
Disabled calibration remains eligible regardless of its stored matrix.

Validation with RT 5.13 and its RTv4 sRGB profile:

- Initial baseline/mixer/combined/disabled corpus: **15/15 passed**.
- Moderate Calibration UI adjustments (each primary, ±20 hue or saturation and
  combined +20/+20) across RGB8, RGB16 and compressed RGB16: **45/45 passed**.
- Expanded diagnostic corpus: **135/144 passed**. Six failures were extreme red
  primary saturation adjustments, which remain reference-only. Three failures
  were the pre-existing +3 EV exposure scenario; this is an unresolved RT 5.13
  parity limitation, not a regression proven to originate in Calibration.

Reports: `/tmp/opencode/wasm-mixer-parity/report.html`,
`/tmp/opencode/wasm-calibration-moderate/report.html`, and
`/tmp/opencode/wasm-calibration-expanded/report.html`.
These are perceptual corpus checks, not a universal equivalence guarantee.

Active Vibrance requires Lab-space processing and skin-protection behavior;
Color Mixer requires RT's flat-curve engine. Local Contrast, Dehaze and other
spatial tools additionally need neighborhood filters. These remain reference-only.

The recorded corpus results above use RawTherapee 5.12; the current server uses
5.13. Those results are not a new parity claim against 5.13. This harness measures
the bundled implementation directly regardless of application routing.

**RAW development and final export parity are separate questions.** Both inputs here are already-developed TIFFs. RAW demosaicing, camera color transforms, import profile application, full-resolution export, external integrations, and application UI/worker routing are outside this harness. This compares decoded pixels using RGB diagnostics and colorimetric ΔE00, rather than JPEG bytes or a spatial model of human perception.
