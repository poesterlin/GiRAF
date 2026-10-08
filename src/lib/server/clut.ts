import sharp from 'sharp';

/** Decode the same RGBX16 Hald data for production previews and parity tests. */
export async function loadClut(path: string) {
	const image = sharp(path);
	const is16bit = (await image.metadata()).depth === 'ushort';
	const { data, info } = await image
		.removeAlpha()
		.toColourspace(is16bit ? 'rgb16' : 'srgb')
		.raw({ depth: is16bit ? 'ushort' : 'uchar' })
		.toBuffer({ resolveWithObject: true });
	const haldLevel = Math.round(Math.cbrt(info.width));
	if (info.width !== info.height || haldLevel < 2 || haldLevel ** 3 !== info.width) {
		throw new Error('Invalid HaldCLUT dimensions');
	}
	if (info.channels !== 3 || data.byteLength !== info.width * info.height * 3 * (is16bit ? 2 : 1)) {
		throw new Error('Invalid HaldCLUT pixel data');
	}
	const rgb = is16bit ? new Uint16Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)) : data;
	const clutData = new Uint16Array(info.width * info.height * 4);
	for (let pixel = 0; pixel < info.width * info.height; pixel++) {
		const scale = is16bit ? 1 : 257;
		clutData[pixel * 4] = rgb[pixel * 3] * scale;
		clutData[pixel * 4 + 1] = rgb[pixel * 3 + 1] * scale;
		clutData[pixel * 4 + 2] = rgb[pixel * 3 + 2] * scale;
	}
	return { clutData, clutLevel: haldLevel ** 2 };
}
