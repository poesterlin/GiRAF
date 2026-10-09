# Spot retouching

Open **Retouch spots** from the mobile editor's overflow menu, or the desktop
bandage tool. The page is `/editor/[image-id]/retouch`.

1. Tap a blemish, then a clean source area.
2. Select a spot and drag its solid target circle or dotted source circle.
3. Adjust size, feathering and opacity. Use Before to compare without spot edits.
4. Save, or return to the editor (pending edits use the existing autosave flow).

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
