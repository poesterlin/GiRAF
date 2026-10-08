// RT 5.12's RTv4_sRGB.icc, verified against the native-reference corpus.
const supportedProfiles = new Set(['17aebbdf8a88c39b07eb881dcd824eb1cf9828914d5e74a7324d7a31045e8871']);

export function embeddedTiffProfile(bytes: Uint8Array): Uint8Array | null {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	if (bytes.length < 8) throw new Error('Invalid TIFF header');
	const little = view.getUint16(0) === 0x4949;
	if (!little && view.getUint16(0) !== 0x4d4d) throw new Error('Invalid TIFF byte order');
	const version = view.getUint16(2, little);
	const big = version === 43;
	if (version !== 42 && !big) throw new Error('Invalid TIFF version');
	const uint64 = (offset: number) => {
		const value = Number(view.getBigUint64(offset, little));
		if (!Number.isSafeInteger(value)) throw new Error('Oversized TIFF offset');
		return value;
	};
	if (big && (view.getUint16(4, little) !== 8 || view.getUint16(6, little) !== 0)) throw new Error('Invalid BigTIFF header');
	const directory = big ? uint64(8) : view.getUint32(4, little);
	const count = big ? uint64(directory) : view.getUint16(directory, little);
	if (count > 4096) throw new Error('Oversized TIFF directory');
	const start = directory + (big ? 8 : 2);
	for (let i = 0; i < count; i++) {
		const entry = start + i * (big ? 20 : 12);
		if (view.getUint16(entry, little) !== 34675) continue;
		if (view.getUint16(entry + 2, little) !== 7) throw new Error('Invalid ICC tag type');
		const length = big ? uint64(entry + 4) : view.getUint32(entry + 4, little);
		const value = entry + (big ? 12 : 8);
		const offset = length <= (big ? 8 : 4) ? value : big ? uint64(value) : view.getUint32(value, little);
		if (!length || offset > bytes.length || length > bytes.length - offset) throw new Error('Invalid ICC profile bounds');
		return bytes.slice(offset, offset + length);
	}
	return null;
}

const eligibility = new WeakMap<Uint8Array, Promise<boolean>>();
export function supportsTiffColor(bytes: Uint8Array): Promise<boolean> {
	const cached = eligibility.get(bytes);
	if (cached) return cached;
	const result = (async () => {
		const profile = embeddedTiffProfile(bytes);
		if (!profile) return true;
		const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(profile));
		const hash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
		return supportedProfiles.has(hash);
	})();
	eligibility.set(bytes, result);
	return result;
}
