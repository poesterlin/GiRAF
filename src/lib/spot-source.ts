type Point = { x: number; y: number };
type Area = Point & { radius: number };
type Pixels = { width: number; height: number; data: ArrayLike<number> };

/** Match an annulus outside the blemish, not the blemish itself. Coordinates are pixel-space. */
export function suggestSpotSource(pixels: Pixels, target: Point, radius: number, feather: number, avoid: Area[] = []): Point | undefined {
	const { width, height, data } = pixels;
	if (!(radius > 0) || !width || !height) return;
	const extent = radius * (1 + feather);
	const ring = extent + 2;
	const samples: { dx: number; dy: number; color: number[] }[] = [];
	function color(x: number, y: number) {
		x = Math.round(x); y = Math.round(y);
		if (x < 0 || y < 0 || x >= width || y >= height) return;
		const i = (y * width + x) * 4;
		return [data[i], data[i+1], data[i+2]];
	}
	for (let i = 0; i < 24; i++) {
		const angle = i * Math.PI / 12;
		const dx = Math.cos(angle) * ring, dy = Math.sin(angle) * ring;
		const value = color(target.x + dx, target.y + dy);
		if (value) samples.push({ dx, dy, color: value });
	}
	if (samples.length < 5) return;
	let best: Point | undefined, bestScore = Infinity;
	function consider(x: number, y: number) {
		if (x < ring || y < ring || x >= width-ring || y >= height-ring) return;
		const distance = Math.hypot(x-target.x,y-target.y);
		if (distance < extent * 2 + 2 || avoid.some(a => Math.hypot(x-a.x,y-a.y) < extent+a.radius+2)) return;
		let score = 0;
		for (const sample of samples) {
			const c = color(x+sample.dx,y+sample.dy)!;
			for(let channel=0;channel<3;channel++) score += (c[channel]-sample.color[channel]) ** 2;
		}
		score = score / (samples.length*3) + distance / Math.max(width,height) * 30;
		if (score < bestScore) { bestScore=score; best={x:Math.round(x),y:Math.round(y)}; }
	}
	// Dense nearby candidates first, then a bounded whole-image search.
	for (const factor of [2.2,3,4,6]) for(let angle=0;angle<32;angle++) {
		consider(target.x+Math.cos(angle*Math.PI/16)*ring*factor,target.y+Math.sin(angle*Math.PI/16)*ring*factor);
	}
	const step = Math.max(8, extent, Math.max(width,height)/32);
	for(let y=ring;y<height-ring;y+=step) for(let x=ring;x<width-ring;x+=step) consider(x,y);
	return best;
}
