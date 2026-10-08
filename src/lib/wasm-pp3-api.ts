interface NativePp3Module {
	_tiff_to_jpeg_with_pp3: (tiff: number, size: number, pp3: number, quality: number) => number;
	_tiff_to_jpeg_with_pp3_and_clut: (tiff: number, size: number, pp3: number, clut: number, count: number, level: number, quality: number) => number;
}

/** Shared native ABI: the CLUT variant places JPEG quality last, not fourth. */
export function renderNativePp3(module: NativePp3Module, tiff: number, size: number, pp3: number, quality: number, clut?: { pointer: number; count: number; level: number }) {
	return clut ? module._tiff_to_jpeg_with_pp3_and_clut(tiff, size, pp3, clut.pointer, clut.count, clut.level, quality) : module._tiff_to_jpeg_with_pp3(tiff, size, pp3, quality);
}
