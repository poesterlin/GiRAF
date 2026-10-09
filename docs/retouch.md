# Spot retouching

Open **Retouch spots** from the mobile editor's overflow menu, or the desktop
bandage tool. The page is `/editor/[image-id]/retouch`.

1. Tap a blemish. A nearby source is suggested by matching colour around the
   blemish, excluding overlapping/existing corrections. The view zooms to 3×.
   Drag the source to refine it; if no candidate is available, tap a source manually.
2. Select a spot and drag its solid target circle or dotted source circle.
3. Adjust size and feathering. Use Before to compare without spot edits.
4. Save, or return to the editor (pending edits use the existing autosave flow).

The target is a solid white circle; the dashed cyan source has a small, muted copy
icon without a background disc. Source suggestions are a simple surrounding-pixel match, not object-aware
healing. Inspect the result and reposition the source when necessary.

Drag empty photo space to pan; pinch or use −/+ to zoom from 1× to 8×. Desktop Fit
returns to the whole photo. A magnified inset appears while touching a point to
place or drag it, and hides on release, pan or pinch. The selected spot button
shows the original target area. Size and Feather use side-by-side shared sliders,
available before placing the source as well as for existing spots. The feather percentage
and outer boundary are visible. The magnifier switches corners to avoid a finger.
RawTherapee 5.13 stores spot opacity but does not apply it in `spot.cc`; no opacity
control is exposed until the renderer supports it.

Spots are stored in ordered RawTherapee `[Spot removal]` PP3 entries. Coordinates
use preview TIFF pixels after coarse rotation/flips. Crop, fine rotation and
geometric corrections are hidden in this workspace, without changing those
settings. Preview coordinates are scaled for full-resolution rendering and
export. The brush limit accounts for RawTherapee's 400-pixel maximum radius.

Retouching uses the server reference renderer. The WASM capability policy rejects
spot-removal profiles rather than ignoring their spots. Native integration tests
cover crop, coarse rotation and scaling:

```sh
SPOT_TEST_CONTAINER=raw-editor-editor-1 bun test src/lib/spot-removal.native.test.ts
```
