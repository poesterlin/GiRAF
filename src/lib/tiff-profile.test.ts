import { expect, test } from 'bun:test';
import { fixtureTiff, withIccProfile } from '../../scripts/preview-parity/fixtures';
import { embeddedTiffProfile, supportsTiffColor } from './tiff-profile';

test('untagged TIFF source and embedded profile bytes are identified without changing samples', async () => {
	const plain = fixtureTiff(16);
	expect(embeddedTiffProfile(plain)).toBeNull();
	expect(await supportsTiffColor(plain)).toBe(true);
	const profile = Buffer.from('An unverified camera or wide-gamut ICC profile');
	const tagged = withIccProfile(plain, profile);
	expect(Buffer.from(embeddedTiffProfile(tagged)!)).toEqual(profile);
	expect(await supportsTiffColor(tagged)).toBe(false);
});

test('malformed TIFF/profile bounds cannot silently select native color assumptions', async () => {
	expect(() => embeddedTiffProfile(new Uint8Array(4))).toThrow();
	const tagged = withIccProfile(fixtureTiff(16), Buffer.alloc(128));
	await expect(supportsTiffColor(tagged.subarray(0, tagged.length - 1))).rejects.toThrow('Invalid ICC profile bounds');
});
