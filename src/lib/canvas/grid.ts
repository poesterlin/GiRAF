import type { PP3 } from "$lib/pp3-utils";

export function getCropHandles(pp3: PP3<number>) {
    const crop = pp3.Crop;

    const handleSize = 16, edgeHandles = false;
    const hs = Math.max(6, handleSize);
    const half = hs / 2;

    const left = crop.X;
    const top = crop.Y;
    const right = crop.X + crop.W;
    const bottom = crop.Y + crop.H;
    const midX = left + crop.W / 2;
    const midY = top + crop.H / 2;

    const make = (name: string, cx: number, cy: number) => ({
        name,
        x: Math.round(cx - half),
        y: Math.round(cy - half),
        w: hs,
        h: hs
    });

    const handles = [
        make('nw', left, top),
        make('ne', right, top),
        make('sw', left, bottom),
        make('se', right, bottom)
    ];

    if (edgeHandles) {
        handles.push(make('n', midX, top));
        handles.push(make('s', midX, bottom));
        handles.push(make('w', left, midY));
        handles.push(make('e', right, midY));
    }

    return handles;
}

export function drawCropGrid(ctx: CanvasRenderingContext2D, pp3: PP3<number>, { padding, paddingX, paddingY, selected }: { padding: number, paddingX?: number, paddingY?: number, selected?: string }) {
    const crop = pp3.Crop;
    if (!crop) return;

    const px = paddingX ?? padding;
    const py = paddingY ?? padding;

    const X = crop.X;
    const Y = crop.Y;
    const W = Math.max(0, crop.W);
    const H = Math.max(0, crop.H);

    const overlayColor = 'rgba(0,0,0,0.45)',
        outlineColor = 'rgba(255,255,255,0.95)',
        gridColor = 'rgba(255,255,255,0.6)',
        handleFill = 'rgba(255,255,255,0.95)',
        handleStroke = 'rgba(0,0,0,0.6)',
        selectedHandleFill = 'rgba(180,180,180,1)',
        lineWidth = 1,
        gridLineWidth = 1;

    const canvas = ctx.canvas;
    const cw = canvas.width;
    const ch = canvas.height;

    // clamp crop to canvas bounds
    const left = Math.max(0, Math.min(cw, X)) + px;
    const top = Math.max(0, Math.min(ch, Y)) + py;
    const width = Math.max(0, Math.min(cw - left, W));
    const height = Math.max(0, Math.min(ch - top, H));
    const right = left + width;
    const bottom = top + height;

    ctx.save();

    // overlay outside crop
    ctx.fillStyle = overlayColor;
    ctx.fillRect(0, 0, cw, top); // top
    ctx.fillRect(0, top, left, height); // left
    ctx.fillRect(right, top, cw - right, height); // right
    ctx.fillRect(0, bottom, cw, ch - bottom); // bottom

    // outline
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = outlineColor;
    ctx.beginPath();
    ctx.rect(left + 0.5, top + 0.5, width, height);
    ctx.stroke();

    // rule-of-thirds grid
    ctx.lineWidth = gridLineWidth;
    ctx.strokeStyle = gridColor;
    const v1 = left + width / 3;
    const v2 = left + (2 * width) / 3;
    const h1 = top + height / 3;
    const h2 = top + (2 * height) / 3;

    ctx.beginPath();
    ctx.moveTo(v1 + 0.5, top);
    ctx.lineTo(v1 + 0.5, bottom);
    ctx.moveTo(v2 + 0.5, top);
    ctx.lineTo(v2 + 0.5, bottom);
    ctx.moveTo(left, h1 + 0.5);
    ctx.lineTo(right, h1 + 0.5);
    ctx.moveTo(left, h2 + 0.5);
    ctx.lineTo(right, h2 + 0.5);
    ctx.stroke();

    // draw handles via helper
    const handles = getCropHandles(pp3);

    handles.forEach(h => {
        // draw filled square with stroke
        ctx.fillStyle = h.name === selected ? selectedHandleFill : handleFill;
        ctx.strokeStyle = handleStroke;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.rect(h.x + 0.5 + px, h.y + 0.5 + py, h.w, h.h);
        ctx.fill();
        ctx.stroke();
    });

    const center = { x: crop.X + crop.W / 2 + px, y: crop.Y + crop.H / 2 + py };

    // draw center handle
    ctx.fillStyle = handleFill;
    ctx.strokeStyle = handleStroke;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(center.x, center.y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // draw center cross
    const crossSize = 50;
    ctx.strokeStyle = handleStroke;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(center.x, crossSize);
    ctx.lineTo(center.x, crossSize);
    ctx.moveTo(crossSize, center.y);
    ctx.lineTo(crossSize, center.y);
    ctx.stroke();

    ctx.restore();
}

export function checkHandleCollision(pp3: PP3<number>, x: number, y: number, hitSlop: number): string | undefined {
    const handles = getCropHandles(pp3);
    let nearest: string | undefined;
    let nearestDistance = Infinity;
    for (const handle of handles) {
        if (x >= handle.x - hitSlop && x <= handle.x + handle.w + hitSlop &&
            y >= handle.y - hitSlop && y <= handle.y + handle.h + hitSlop) {
            const distance = Math.hypot(x - (handle.x + handle.w / 2), y - (handle.y + handle.h / 2));
            if (distance < nearestDistance) {
                nearest = handle.name;
                nearestDistance = distance;
            }
        }
    }
	if (nearest) return nearest;

    return checkGridCollision(pp3, x, y, hitSlop) ? 'grid' : undefined;
}

export function getGridCenter(pp3: PP3<number>, { padding }: { padding: number }) {
    const crop = pp3.Crop;
    return { x: crop.X + crop.W / 2 + padding, y: crop.Y + crop.H / 2 + padding };
}

export function checkGridCollision(pp3: PP3<number>, x: number, y: number, hitSlop: number): boolean {
    const crop = pp3.Crop;
    const left = crop.X - hitSlop;
    const top = crop.Y - hitSlop;
    const right = crop.X + crop.W + hitSlop;
    const bottom = crop.Y + crop.H + hitSlop;
    return x >= left && x <= right && y >= top && y <= bottom;
}

export function moveHandle(
    pp3: PP3<number>,
    handle: string,
    dx: number,
    dy: number,
    dimensions: { width: number, height: number },
    bounds?: { left: number, top: number, right: number, bottom: number }
) {
    const crop = pp3.Crop;

    switch (handle) {
        case 'nw':
            crop.X += dx;
            crop.Y += dy;
            crop.W -= dx;
            crop.H -= dy;
            break;
        case 'ne':
            crop.Y += dy;
            crop.W += dx;
            crop.H -= dy;
            break;
        case 'sw':
            crop.X += dx;
            crop.W -= dx;
            crop.H += dy;
            break;
        case 'se':
            crop.W += dx;
            crop.H += dy;
            break;
        case "grid":
            moveGrid(pp3, dx, dy);
            break;
    }

    // recitfy crop dimensions
    if (crop.W < 0) {
        crop.X += crop.W;
        crop.W = -crop.W;
    }

    if (crop.H < 0) {
        crop.Y += crop.H;
        crop.H = -crop.H;
    }

    // Use bounds if provided, otherwise fall back to dimensions
    const minX = bounds?.left ?? 0;
    const minY = bounds?.top ?? 0;
    const maxX = bounds?.right ?? dimensions.width;
    const maxY = bounds?.bottom ?? dimensions.height;

    // clamp crop to bounds
    crop.X = round(Math.max(minX, Math.min(crop.X, maxX - crop.W)));
    crop.Y = round(Math.max(minY, Math.min(crop.Y, maxY - crop.H)));
    crop.W = round(Math.max(20, Math.min(crop.W, maxX - crop.X)));
    crop.H = round(Math.max(20, Math.min(crop.H, maxY - crop.Y)));
}
const round = Math.round;

export function moveGrid(pp3: PP3<number>, dx: number, dy: number) {
    const crop = pp3.Crop;
    crop.X += dx;
    crop.Y += dy;
}
