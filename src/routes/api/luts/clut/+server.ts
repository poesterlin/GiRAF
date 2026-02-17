import { env } from '$env/dynamic/private';
import type { RequestHandler } from '@sveltejs/kit';
import { error } from '@sveltejs/kit';
import sharp from 'sharp';

export const GET: RequestHandler = async ({ url }) => {
	const lutPath = url.searchParams.get('path');
	if (!lutPath) {
		error(400, 'Missing path parameter');
	}

	// Security: ensure the path is within CLUT_DIR
	const clutDir = env.CLUT_DIR;
	if (!clutDir || !lutPath.startsWith(clutDir)) {
		error(403, 'Invalid LUT path');
	}

	const file = Bun.file(lutPath);
	if (!(await file.exists())) {
		error(404, 'LUT file not found');
	}

	// Parse HaldCLUT PNG to raw RGBX uint16 data
	const img = sharp(lutPath);
	const metadata = await img.metadata();
	const width = metadata.width!;
	const height = metadata.height!;

	if (width !== height) {
		error(400, 'Not a valid HaldCLUT image: not square');
	}

	// HaldCLUT at "hald level" L: image is L³ × L³ pixels
	// The 3D LUT has L² steps per channel → cube dimension = L²
	// Total entries = (L²)³ = L⁶ = width × height
	const L = Math.round(Math.cbrt(width));
	if (L * L * L !== width) {
		error(400, `Not a valid HaldCLUT image: width ${width} is not a perfect cube`);
	}

	const cubeLevel = L * L; // steps per channel
	const totalEntries = width * height; // L⁶ = cubeLevel³

	// Force output to 3-channel RGB (handles grayscale CLUTs)
	const raw = await img.removeAlpha().ensureAlpha(0).raw().toColorspace('srgb').toBuffer();
	const channels = 4; // ensureAlpha gives us RGBA
	const is16bit = metadata.depth === 'ushort';

	// Output: RGBX uint16 layout, 4 values per entry
	const output = new Uint16Array(totalEntries * 4);

	for (let i = 0; i < totalEntries; i++) {
		const srcOffset = i * channels;
		const dstOffset = i * 4;

		if (is16bit) {
			const src = new Uint16Array(raw.buffer, raw.byteOffset + srcOffset * 2, 3);
			output[dstOffset] = src[0];
			output[dstOffset + 1] = src[1];
			output[dstOffset + 2] = src[2];
		} else {
			// 8-bit: scale to 16-bit (0-255 → 0-65535)
			output[dstOffset] = Math.round((raw[srcOffset] / 255) * 65535);
			output[dstOffset + 1] = Math.round((raw[srcOffset + 1] / 255) * 65535);
			output[dstOffset + 2] = Math.round((raw[srcOffset + 2] / 255) * 65535);
		}
		output[dstOffset + 3] = 0; // padding
	}

	return new Response(Buffer.from(output.buffer), {
		headers: {
			'Content-Type': 'application/octet-stream',
			'Cache-Control': 'public, max-age=31536000, immutable',
			'X-Clut-Level': String(cubeLevel)
		}
	});
};
