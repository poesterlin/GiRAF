# Import auto-exposure baseline

New editor TIFFs receive a stored `image.import_baseline` PP3 profile. Analysis
uses native Sharp/libvips TIFF decoding and a server-side JavaScript port of
RawTherapee 5.12's histogram auto-exposure calculation, after RAW-stage
processing, avoiding reuse of already-baked RAW exposure values. RGB8 samples
are expanded to RGB16; all channels contribute to an 8,192-bin inverse-sRGB
histogram. The scalar calculation retains its octiles, 0.02% clipping, float32
rounding and integer slider values rather than substituting a luminance heuristic.

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

Analysis runs in a separate Bun process. The production image includes both
analysis scripts and Sharp's native runtime dependency. Import cancellation
terminates the child, and a 60-second wall-clock deadline bounds decoding plus
histogram work. TIFFs are limited to 1 GiB and 64 megapixels (at most 384 MiB of
decoded RGB16 samples); native pixel decoding also has a 45-second timeout.
Unsupported TIFF colour models and malformed files fail explicitly.

Run `bun test scripts/auto-exposure.test.ts` for native TIFF decoding, histogram
and resolved-slider regression tests. Existing stored baselines are not
recalculated by this replacement.
