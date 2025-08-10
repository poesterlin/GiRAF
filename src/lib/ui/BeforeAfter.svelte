<script lang="ts">
  const { beforeImage, afterImage } = $props<{
    beforeImage: string;
    afterImage: string;
  }>();

  let split = $state(0.5);

  // Shared transform for both images
  let scale = $state(1);
  let x = $state(0);
  let y = $state(0);

  let containerEl: HTMLElement | undefined = $state();
  let sliderEl: HTMLElement | undefined = $state();
  let isDraggingSlider = $state(false);

  const pointers = new Map<number, PointerEvent>();
  let lastMidpoint: { x: number; y: number } | null = null;
  let lastDistance = 0;

  function applyChange(opts: {
    panX?: number;
    panY?: number;
    scaleDiff?: number;
    originX?: number;
    originY?: number;
  }) {
    const {
      panX = 0,
      panY = 0,
      scaleDiff = 1,
      originX = 0,
      originY = 0,
    } = opts;

    let newScale = scale * scaleDiff;
    newScale = Math.max(0.1, Math.min(newScale, 100));
    const finalScaleDiff = newScale / scale;

    const newX = originX - (originX - x) * finalScaleDiff + panX;
    const newY = originY - (originY - y) * finalScaleDiff + panY;

    scale = newScale;
    x = newX;
    y = newY;
  }

  // Zoom with wheel/trackpad pinch (ctrlKey on some devices)
  function onWheel(event: WheelEvent) {
    event.preventDefault();
    if (!containerEl) return;

    const rect = containerEl.getBoundingClientRect();
    const deltaY = event.deltaY;
    const zoomingOut = deltaY > 0;
    const divisor = event.ctrlKey ? 100 : 300;
    const ratio = 1 - (zoomingOut ? -deltaY : deltaY) / divisor;
    const scaleDiff = zoomingOut ? 1 / ratio : ratio;

    applyChange({
      scaleDiff,
      originX: event.clientX - rect.left,
      originY: event.clientY - rect.top,
    });
  }

  // Pan/Pinch on the container
  function onPointerDown(event: PointerEvent) {
    if (!containerEl) return;
    containerEl.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, event);

    if (pointers.size === 1) {
      lastMidpoint = { x: event.clientX, y: event.clientY };
    } else if (pointers.size === 2) {
      const [p1, p2] = Array.from(pointers.values());
      lastMidpoint = {
        x: (p1.clientX + p2.clientX) / 2,
        y: (p1.clientY + p2.clientY) / 2,
      };
      lastDistance = Math.hypot(
        p1.clientX - p2.clientX,
        p1.clientY - p2.clientY
      );
    }
  }

  function onPointerMove(event: PointerEvent) {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, event);

    if (pointers.size === 1 && lastMidpoint) {
      const panX = event.clientX - lastMidpoint.x;
      const panY = event.clientY - lastMidpoint.y;
      lastMidpoint = { x: event.clientX, y: event.clientY };
      applyChange({ panX, panY });
    } else if (pointers.size === 2 && containerEl && lastMidpoint) {
      const [p1, p2] = Array.from(pointers.values());
      const newMidpoint = {
        x: (p1.clientX + p2.clientX) / 2,
        y: (p1.clientY + p2.clientY) / 2,
      };
      const newDistance = Math.hypot(
        p1.clientX - p2.clientX,
        p1.clientY - p2.clientY
      );

      const panX = newMidpoint.x - lastMidpoint.x;
      const panY = newMidpoint.y - lastMidpoint.y;
      const scaleDiff = lastDistance > 0 ? newDistance / lastDistance : 1;

      const rect = containerEl.getBoundingClientRect();
      applyChange({
        panX,
        panY,
        scaleDiff,
        originX: newMidpoint.x - rect.left,
        originY: newMidpoint.y - rect.top,
      });

      lastMidpoint = newMidpoint;
      lastDistance = newDistance;
    }
  }

  function onPointerUp(event: PointerEvent) {
    pointers.delete(event.pointerId);
    if (pointers.size < 2) lastDistance = 0;
    if (pointers.size < 1) lastMidpoint = null;
  }

  // Slider drag (use pointer capture on the slider itself)
  function onSliderPointerDown(event: PointerEvent) {
    event.stopPropagation();
    isDraggingSlider = true;
    sliderEl?.setPointerCapture(event.pointerId);
  }

  function onSliderPointerMove(event: PointerEvent) {
    if (!isDraggingSlider || !containerEl) return;
    event.stopPropagation();
    const rect = containerEl.getBoundingClientRect();
    const newSplit = (event.clientX - rect.left) / rect.width;
    split = Math.max(0, Math.min(1, newSplit));
  }

  function onSliderPointerUp(event: PointerEvent) {
    if (!isDraggingSlider) return;
    event.stopPropagation();
    isDraggingSlider = false;
    sliderEl?.releasePointerCapture(event.pointerId);
  }
</script>

<div
  class="container"
  bind:this={containerEl}
  onwheel={onWheel}
  onpointerdown={onPointerDown}
  onpointermove={onPointerMove}
  onpointerup={onPointerUp}
  onpointercancel={onPointerUp}
  style:--split={`${split * 100}%`}
  style:cursor={isDraggingSlider ? 'ew-resize' : 'grab'}
>
  <!-- Before -->
  <div class="pane">
    <img
      src={beforeImage}
      alt="Before"
      draggable="false"
      style:transform={`translate(${x}px, ${y}px) scale(${scale})`}
    />
  </div>

  <!-- After (clipped) -->
  <div class="pane after-pane">
    <img
      src={afterImage}
      alt="After"
      draggable="false"
      style:transform={`translate(${x}px, ${y}px) scale(${scale})`}
    />
  </div>

  <!-- Slider -->
  <div
    class="slider"
    bind:this={sliderEl}
    onpointerdown={onSliderPointerDown}
    onpointermove={onSliderPointerMove}
    onpointerup={onSliderPointerUp}
    onpointercancel={onSliderPointerUp}
    onlostpointercapture={onSliderPointerUp}
  >
    <div class="scrubber">
      <svg viewBox="0 0 27 20" aria-hidden="true">
        <path class="arrow-left" d="M9.6 0L0 9.6l9.6 9.6z" />
        <path class="arrow-right" d="M17 19.2l9.5-9.6L16.9 0z" />
      </svg>
    </div>
  </div>
</div>

<style>
  .container {
    position: relative;
    width: 100%;
    height: 500px; /* You can override this from the parent */
    overflow: hidden;
    user-select: none;
    touch-action: none;
    background: #eee;
    border-radius: 8px;
  }

  .pane {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: hidden;
  }

  .pane img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    pointer-events: none;
    transform-origin: 0 0;
  }

  /* Show only the right side of "after" based on --split */
  .after-pane {
    clip-path: inset(0 0 0 var(--split));
  }

  .slider {
    position: absolute;
    top: 0;
    left: var(--split); /* Position by left, not translateX(% of 4px) */
    transform: translateX(-50%);
    width: 4px;
    height: 100%;
    background: #fff;
    cursor: ew-resize;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow:
      0 0 5px rgba(0, 0, 0, 0.5),
      0 0 10px rgba(0, 0, 0, 0.3);
    z-index: 5;
    /* Make sure touch gestures are captured here too */
    touch-action: none;
  }

  .scrubber {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: #fff;
    border: 2px solid rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: inherit;
  }

  .scrubber svg {
    width: 27px;
    height: 20px;
    fill: rgba(0, 0, 0, 0.7);
  }
</style>