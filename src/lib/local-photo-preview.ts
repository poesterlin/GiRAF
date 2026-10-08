const RAF_SIGNATURE = 'FUJIFILMCCD-RAW ';
const METADATA_LIMIT = 256 * 1024;
const MAX_PREVIEW_SIZE = 32 * 1024 * 1024;

/** URLs returned here belong to the caller, which must revoke them when no longer used. */
export async function extractLocalPhotoPreview(file: File, options: { preferThumbnail?: boolean } = {}): Promise<{ url: string; capturedAt?: Date }> {
	const header = new Uint8Array(await file.slice(0, 92).arrayBuffer());
	const jpeg = header[0] === 0xff && header[1] === 0xd8;
	const png = [137, 80, 78, 71, 13, 10, 26, 10].every((byte, i) => header[i] === byte);
	let preview: Blob;
	if (jpeg || png) {
		preview = file.slice(0, file.size, jpeg ? 'image/jpeg' : 'image/png');
	} else if (new TextDecoder().decode(header.subarray(0, 16)) === RAF_SIGNATURE) {
		if (header.length < 92) throw new Error('Truncated RAF header.');
		const view = new DataView(header.buffer);
		const offset = view.getUint32(84, false);
		const length = view.getUint32(88, false);
		if (offset < 92 || length < 4 || length > MAX_PREVIEW_SIZE || offset + length > file.size) {
			throw new Error('RAF embedded JPEG has invalid offsets or size.');
		}
		preview = file.slice(offset, offset + length, 'image/jpeg');
	} else {
		throw new Error('No supported local preview: expected a Fujifilm RAF, JPEG, or PNG.');
	}
	let capturedAt: Date | undefined;
	if (preview.type === 'image/jpeg') {
		const metadata = new Uint8Array(await preview.slice(0, METADATA_LIMIT).arrayBuffer());
		if (metadata[0] !== 0xff || metadata[1] !== 0xd8) {
			throw new Error('RAF embedded preview is not a JPEG.');
		}
		capturedAt = readCaptureDate(metadata);
		if (options.preferThumbnail) preview = readThumbnail(metadata) ?? preview;
	}
	return { url: URL.createObjectURL(preview), ...(capturedAt ? { capturedAt } : {}) };
}

// IFD offsets are relative to the TIFF header, and must stay inside this APP1.
function readThumbnail(bytes: Uint8Array): Blob | undefined {
	try {
		const jpeg = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
		let position = 2;
		while (position + 4 <= bytes.length) {
			if (bytes[position++] !== 0xff) return;
			while (bytes[position] === 0xff) position++;
			const marker = bytes[position++];
			if (marker === 0xda || marker === 0xd9) return;
			if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
			const size = jpeg.getUint16(position);
			if (size < 2 || position + size > bytes.length) return;
			const start = position + 2;
			if (marker === 0xe1 && new TextDecoder().decode(bytes.subarray(start, start + 6)) === 'Exif\0\0') {
				const tiff = bytes.subarray(start + 6, position + size);
				const view = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
				const order = new TextDecoder().decode(tiff.subarray(0, 2));
				if (order !== 'II' && order !== 'MM') return;
				const little = order === 'II';
				if (view.getUint16(2, little) !== 42) return;
				const directory = (offset: number) => {
					if (offset < 8 || offset + 2 > tiff.length) throw new Error('Invalid IFD');
					const count = view.getUint16(offset, little);
					const end = offset + 2 + count * 12;
					if (end + 4 > tiff.length) throw new Error('Truncated IFD');
					const values = new Map<number, number>();
					for (let entry = offset + 2; entry < end; entry += 12) {
						const type = view.getUint16(entry + 2, little);
						const tag = view.getUint16(entry, little);
						if ((tag === 0x201 || tag === 0x202) && type !== 4) continue;
						if (tag === 0x112 && type !== 3) continue;
						if (view.getUint32(entry + 4, little) !== 1) continue;
						if (type === 3 || type === 4) values.set(view.getUint16(entry, little), type === 3 ? view.getUint16(entry + 8, little) : view.getUint32(entry + 8, little));
					}
					return { values, next: view.getUint32(end, little) };
				};
				const parent = directory(view.getUint32(4, little));
				if (!parent.next) return;
				const thumbnail = directory(parent.next).values;
				const offset = thumbnail.get(0x201);
				const length = thumbnail.get(0x202);
				if (offset === undefined || length === undefined || offset < 8 || length < 4 || offset + length > tiff.length) return;
				const data = tiff.subarray(offset, offset + length);
				if (data[0] !== 255 || data[1] !== 216 || data[length - 2] !== 255 || data[length - 1] !== 217) return;
				const dimensions = jpegDimensions(data);
				if (dimensions && Math.max(...dimensions) < 160) return;
				const orientation = thumbnail.get(0x112) ?? parent.values.get(0x112) ?? 1;
				if (orientation < 1 || orientation > 8) return;
				// Prepend a minimal orientation APP1. Decoders
				// then apply the same EXIF transform as for the full camera preview.
				const exif = new Uint8Array([255, 225, 0, 34, 69, 120, 105, 102, 0, 0, 77, 77, 0, 42, 0, 0, 0, 8, 0, 1, 1, 18, 0, 3, 0, 0, 0, 1, 0, orientation, 0, 0, 0, 0, 0, 0]);
				return new Blob([data.slice(0, 2), exif, ...withoutExif(data)], { type: 'image/jpeg' });
			}
			position += size;
		}
	} catch {
		// Optional corrupt thumbnail metadata falls back to the full preview.
	}
}

// Avoid competing orientation tags if the thumbnail already has an EXIF APP1.
function withoutExif(bytes: Uint8Array): Uint8Array<ArrayBuffer>[] {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const chunks: Uint8Array<ArrayBuffer>[] = [];
	let position = 2;
	let kept = 2;
	while (position + 4 <= bytes.length) {
		const markerStart = position;
		if (bytes[position++] !== 255) break;
		while (bytes[position] === 255) position++;
		const marker = bytes[position++];
		if (marker === 0xda || marker === 0xd9) break;
		if (marker === 1 || (marker >= 0xd0 && marker <= 0xd7)) continue;
		const size = view.getUint16(position);
		if (size < 2 || position + size > bytes.length) break;
		if (marker === 0xe1 && new TextDecoder().decode(bytes.subarray(position + 2, position + 8)) === 'Exif\0\0') {
			chunks.push(bytes.slice(kept, markerStart));
			kept = position + size;
		}
		position += size;
	}
	chunks.push(bytes.slice(kept));
	return chunks;
}

function jpegDimensions(bytes: Uint8Array): [number, number] | undefined {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	let position = 2;
	while (position + 4 <= bytes.length) {
		if (bytes[position++] !== 255) return;
		while (bytes[position] === 255) position++;
		const marker = bytes[position++];
		if (marker === 0xda || marker === 0xd9) return;
		if (marker === 1 || (marker >= 0xd0 && marker <= 0xd7)) continue;
		const size = view.getUint16(position);
		if (size < 2 || position + size > bytes.length) return;
		if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker) && size >= 8)
			return [view.getUint16(position + 5), view.getUint16(position + 3)];
		position += size;
	}
}

// Metadata is optional: malformed or larger-than-budget EXIF never prevents a preview.
function readCaptureDate(bytes: Uint8Array): Date | undefined {
	try {
		const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
		let position = 2;
		while (position + 4 <= bytes.length) {
			if (bytes[position++] !== 0xff) return;
			while (bytes[position] === 0xff) position++;
			const marker = bytes[position++];
			if (marker === 0xda || marker === 0xd9) return;
			if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
			const size = view.getUint16(position);
			if (size < 2 || position + size > bytes.length) return;
			const start = position + 2;
			if (marker === 0xe1 && new TextDecoder().decode(bytes.subarray(start, start + 6)) === 'Exif\0\0') {
				return readTiffDate(bytes.subarray(start + 6, position + size));
			}
			position += size;
		}
	} catch {
		// Ignore corrupt optional metadata.
	}
}

function readTiffDate(bytes: Uint8Array): Date | undefined {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const order = new TextDecoder().decode(bytes.subarray(0, 2));
	if (order !== 'II' && order !== 'MM') return;
	const little = order === 'II';
	if (view.getUint16(2, little) !== 42) return;
	const find = (offset: number, tag: number): number | undefined => {
		const count = view.getUint16(offset, little);
		if (offset + 2 + count * 12 > bytes.length) return;
		for (let i = 0; i < count; i++) {
			const entry = offset + 2 + i * 12;
			if (view.getUint16(entry, little) === tag) return entry;
		}
	};
	const pointer = find(view.getUint32(4, little), 0x8769);
	if (pointer === undefined || view.getUint16(pointer + 2, little) !== 4) return;
	const entry = find(view.getUint32(pointer + 8, little), 0x9003);
	if (entry === undefined || view.getUint16(entry + 2, little) !== 2 || view.getUint32(entry + 4, little) !== 20) return;
	const offset = view.getUint32(entry + 8, little);
	if (offset + 20 > bytes.length) return;
	const value = new TextDecoder().decode(bytes.subarray(offset, offset + 19));
	const match = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(value);
	if (!match) return;
	const [year, month, day, hour, minute, second] = match.slice(1).map(Number);
	const date = new Date(year, month - 1, day, hour, minute, second);
	if (
		date.getFullYear() === year &&
		date.getMonth() === month - 1 &&
		date.getDate() === day &&
		date.getHours() === hour &&
		date.getMinutes() === minute &&
		date.getSeconds() === second
	)
		return date;
}
