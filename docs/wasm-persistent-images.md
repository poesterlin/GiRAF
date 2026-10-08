# Persistent decoded-image optimization

The parity harness is the correctness gate for the next optimization pass. The
initial bundled WASM failed exposure, white-balance, tint, and contrast pixel parity
against RawTherapee 5.12. The LUT calling-convention bug is fixed. Production previews therefore
use the reference renderer (see `src/lib/preview-parity-policy.ts`).

## Source repository

The sibling `../rt-wasm` is now a Git checkout of
<https://github.com/poesterlin/rt-wasm>, initially at
`558ecbf2e4f535a857979ce9309614dec67e6606`. Its source includes the PP3, white-balance,
tint, and LUT implementation. The older unversioned directory is preserved at
`../rt-wasm-local-backup-20261008`.

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
Exposure, white-balance, and other processing differences remain.

`src/rt_cli_wrapper.cpp` also provides `rt_cli_init`, `rt_cli_cleanup`, and
`rt_process_with_pp3`. These are filename-based full-engine APIs when enabled;
they are stubs in the default lightweight build, not decode-once APIs.

## Additive decoded-image contract

The upstream checkout now has locally implemented additive exports, built and
installed in the editor:

1. `load_tiff_image(bytes, length)` decodes a TIFF once and returns an opaque
   handle. To keep this optimization byte-identical, it preserves the existing
   8-bit decoded representation; improving 16-bit precision is a separate change.
2. `render_tiff_image(handle, pp3, clut, elementCount, cubeDimension, quality)`
   processes from that original image using a reusable scratch buffer.
3. `release_tiff_image(handle)` frees the decoded image and scratch. The worker keeps
   only one active preview image and one active LUT in native memory.
4. The existing entry points remain compatible. Export checks and repeated-edit
   tests run before the editor build command publishes replacement artifacts.
5. JavaScript does not retain heap views across calls which may grow WASM memory.

The native tests pass 48 byte-identical retained/fresh JPEG comparisons and 48
bundled/fresh comparisons, including A → B → A edits, LUT changes, freed input
ownership, stale handles, invalid dimensions, and recovery from failed operations.
The native source changes are local and uncommitted; the provenance manifest
explicitly records `dirty: true` rather than implying the upstream revision alone
reproduces them. Tests live in `../rt-wasm/test/persistent-images.mjs`.

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

The worker uses the additive decoded-image API when available and retains legacy
encoded-input reuse for older modules. Decoded-image reuse preserves the current
renderer; it does not fix native-reference processing differences. Passing that
parity gate remains a prerequisite for browser-side production rendering.
