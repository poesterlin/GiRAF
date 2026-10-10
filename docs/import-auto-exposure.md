# Import auto-exposure baseline

New editor TIFFs receive a stored `image.import_baseline` PP3 profile. Analysis
uses the browser renderer's TIFF histogram and auto-exposure calculation, after
RAW-stage processing, avoiding reuse of already-baked RAW exposure values.

The baseline contains resolved Exposure compensation, brightness, contrast,
black level, highlight compression and its threshold, with Auto disabled.
Editor, crop, retouch, reset and export use it when no user snapshot exists.
It does not create a snapshot or mark the image edited. Existing snapshots take
precedence; existing TIFFs without a baseline retain their previous behavior.
Regenerating a TIFF during import repair also regenerates its baseline.

The Light panel's **Reset exposure to defaults** button restores the six resolved
exposure values from this baseline, with Auto disabled. It records one undo step
and preserves other adjustments. For older images without a stored baseline,
the button restores the client profile's original automatic exposure behavior.

Analysis runs in a separate Bun process to isolate the retained-image WASM
instance from concurrent imports and browser previews. The production image
includes the analysis script and uses the matching deployed WASM artifacts.

Native tests compare Auto-on output with resolved manual output byte for byte
on RGB8, RGB16 and compressed RGB16 fixtures, including repeated clipping
settings. `bun run wasm:build` verifies this before installing artifacts.
`RT_WASM_SKIP_BUILD=1 bun run wasm:build` verifies and installs artifacts already
built with the cached builder when Docker Hub is unavailable.
