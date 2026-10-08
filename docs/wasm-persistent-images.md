# Persistent decoded-image optimization

The installed pipeline keeps original RGB8/RGB16 pixels immutable, caches image
analysis and geometry, and uses native previews for validated settings. Unsupported
tools and unverified color profiles use RawTherapee transparently. No engine
indicator is added to the editor.

## Source repository

The sibling `../rt-wasm` is now a Git checkout of
<https://github.com/poesterlin/rt-wasm>, initially at
`558ecbf2e4f535a857979ce9309614dec67e6606`. Its source includes the PP3, white-balance,
tint, and LUT implementation. The older unversioned directory is preserved at
`../rt-wasm-local-backup-20261008`.

The implementation is committed locally as
`84b8cc08a04bdb0139d6e7421ad2e0d67309742c` on `feat/precision-preview`. The installed
manifest records that revision with `dirty: false`.

Run `bun run wasm:build` to compile this checkout, verify the editor entry points,
and install its artifacts and source-provenance manifest in `static/`. Override
the checkout path with `RT_WASM_SOURCE_DIR`. The current preview wrapper builds
with `RT_WASM_ENABLE_RTENGINE=OFF`; the optional full engine is a separate build
configuration. Building does not enable the production parity gate.

The deployed API is:

```text
tiff_to_jpeg_with_pp3(tiffPointer, tiffByteLength, pp3Pointer, quality)
tiff_to_jpeg_with_pp3_and_clut(tiffPointer, tiffByteLength, pp3Pointer,
                            clutPointer, clutElementCount, cubeDimension, quality)
get_output_data(), get_output_size(), free_output(), get_error_message()
```

The recovered signature places quality **last** in the LUT call. The editor
previously placed it fourth, causing out-of-bounds accesses. Correcting that call
removed LUT traps and allowed LUT cases to pass the synthetic parity corpus.
Subsequent corrections preserve 16-bit samples, reuse RT 5.12 scalar auto-exposure
math, process exposure in linear RGB, align white-balance scaling, and apply
working-space tone/saturation math. These are extracted processing components,
not the full desktop engine; capabilities remain explicitly limited.

`src/rt_cli_wrapper.cpp` also provides `rt_cli_init`, `rt_cli_cleanup`, and
`rt_process_with_pp3`. These are filename-based full-engine APIs when enabled;
they are stubs in the default lightweight build, not decode-once APIs.

## Additive decoded-image contract

The upstream checkout now has locally implemented additive exports, built and
installed in the editor:

1. `load_tiff_image(bytes, length)` decodes a TIFF once and returns an opaque
   handle. RGB16 and grayscale16 samples remain 16-bit through edits and geometry;
   RGB8 inputs retain their native depth. Supported TIFF layouts include compressed
   strips, separate planes, and orientation metadata.
2. `render_tiff_image(handle, pp3, clut, elementCount, cubeDimension, quality)`
   processes from that original image using a reusable scratch buffer.
3. `release_tiff_image(handle)` frees the decoded image and scratch. The worker keeps
   only one active preview image and one active LUT in native memory.
4. The existing entry points remain compatible. Export checks and repeated-edit
   tests run before the editor build command publishes replacement artifacts.
5. JavaScript does not retain heap views across calls which may grow WASM memory.

The native tests pass **420 byte-identical retained/fresh JPEG comparisons**,
including A → B → A edits, LUT changes, geometry changes, freed input ownership,
stale handles, invalid dimensions, and recovery from failed operations. Tests
live in `../rt-wasm/test/persistent-images.mjs`.

## Cached work

- Decode once into immutable source samples; reusable color scratch is restored
  before every render, preventing accumulated edits.
- Auto exposure lazily builds an 8,192-bin inverse-sRGB histogram from all original
  channels. Cache the six resolved values by clip percentage. Slider, WB, crop,
  and rotation changes do not invalidate TIFF-source analysis. Auto off retains
  manual settings, and Auto on uses the same cached source analysis.
- Cache geometry maps by source dimensions and geometry settings. Color changes
  reuse maps; identity geometry skips map allocation and copying entirely.
- Quantize RGB16 to RGB8 only when packing the final JPEG.
- Cache active TIFF/LUT bytes and native allocations in the worker. Pending edits
  coalesce; stale completions cannot replace newer previews.
- Load JS, WASM, and pthread-worker assets with one artifact revision to avoid
  mixed browser-cache versions.

## Acceptance evidence

The expanded corpus passed **99/99 practical perceptual comparisons** against
RawTherapee 5.12: RGB8/RGB16, compressed RGB16, the verified RTv4 sRGB profile,
auto-exposure clipping, stronger exposure/WB ranges, brightness, black point,
highlight/shadow compression, curves, saturation, LUT strengths, coarse rotation,
straightening and crop. Report: `/tmp/opencode/preview-complete-expanded/report.html`.

The actual browser worker also rendered and decoded two cropped/straightened
RGB16 previews at the expected 64×48 dimensions, with no reference fallback.

## Required evidence before enabling or publishing

- Run the same native-reference parity corpus against deployed and candidate
  artifacts. Candidates must satisfy the practical perceptual thresholds and
  supported-feature checks; passing a neutral
  baseline alone is insufficient.
- Test repeated A → B → A settings on a retained image against fresh loads to
  detect cumulative mutation, stale tone curves, or white-balance cache errors.
- Test changing images, replacing/clearing LUTs, failed loads/renders, and repeated
  release/error paths. Unsupported settings must use the reference renderer.
- Exercise representative 16-bit imported TIFFs, color profiles, gradients,
  clipping, transformations, and LUT strengths—not just synthetic RGB fixtures.
- Measure decoding, editing, encoding, copying, and peak memory separately. No
  decode-once speedup has been established yet.

The worker additionally checks PP3 capabilities and TIFF color profiles. Examples
requiring reference rendering include sharpening with nonzero amount, Fattal tone
mapping, active shadows/highlights tooling, arbitrary ICC profiles, other working
spaces, unsupported WB modes/curves, resize, and lens/perspective corrections.
Straightening is bilinear post-color resampling and meets the measured perceptual
budget, rather than being byte-identical to desktop interpolation. Continue to
expand the corpus with representative real imports when extending capabilities.
