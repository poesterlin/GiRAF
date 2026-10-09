# Spot retouching

Open **Retouch spots** from the mobile editor's overflow menu, or the desktop
bandage tool. The page is `/editor/[image-id]/retouch`.

1. Tap a blemish. The view zooms to 3× so you can tap a clean source precisely.
2. Select a spot and drag its solid target circle or dotted source circle.
3. Adjust size and feathering. Use Before to compare without spot edits.
4. Save, or return to the editor (pending edits use the existing autosave flow).

Drag empty photo space to pan; pinch or use −/+ to zoom from 1× to 8×. Desktop Fit
returns to the whole photo. A magnified inset follows the selected point while
dragging. Numbered spot buttons select existing corrections. Size and Feather
tabs use the editor's shared slider to keep mobile controls compact. The feather percentage
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
