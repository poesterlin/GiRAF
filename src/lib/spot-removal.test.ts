import { expect, test } from 'bun:test';
import { parsePP3, stringifyPP3 } from './pp3-utils';
import { supportsWasmPreview } from './preview-parity-policy';
import { mapSpotRemovalToTarget, readSpotRemoval, writeSpotRemoval } from './spot-removal';

// Seven doubles in RT's source/target/radius/feather/opacity order, including
// the trailing GLib list separator. Deliberately asymmetric positions.
const profile = `[Spot removal]
Enabled=true
Spot1=120;80;430;210;12;0.75;0.6;
Spot2=430;210;600;300;8;1;1;
[Exposure]
Compensation=0.5`;

test('reads actual RT wire format and writes a contiguous ordered sequence', () => {
	const pp3 = parsePP3(profile);
	const settings = readSpotRemoval(pp3);
	expect(settings).toEqual({
		enabled: true,
		entries: [
			{ source: { x: 120, y: 80 }, target: { x: 430, y: 210 }, radius: 12, feather: 0.75, opacity: 0.6 },
			{ source: { x: 430, y: 210 }, target: { x: 600, y: 300 }, radius: 8, feather: 1, opacity: 1 }
		]
	});
	const reduced = writeSpotRemoval(pp3, { enabled: true, entries: settings.entries.slice(1) });
	expect(reduced.Spot_removal).toEqual({ Enabled: true, Spot1: '430;210;600;300;8;1;1;' });
	expect(stringifyPP3(reduced)).toContain('[Spot removal]');
	expect(reduced.Exposure).toEqual(pp3.Exposure);
	expect(pp3.Spot_removal.Spot2).toBe('430;210;600;300;8;1;1;');
	expect(readSpotRemoval(parsePP3(stringifyPP3(reduced))).entries).toEqual(settings.entries.slice(1));
});

test('clear removes all numbered entries while keeping unrelated settings', () => {
	const pp3 = parsePP3(profile);
	pp3.Spot_removal.FutureSetting = 42;
	const cleared = writeSpotRemoval(pp3, { enabled: false, entries: [] });
	expect(cleared.Spot_removal).toEqual({ Enabled: false, FutureSetting: 42 });
	expect(readSpotRemoval(cleared)).toEqual({ enabled: false, entries: [] });
});

test('follows RT first-gap rule and safely ignores malformed external lists', () => {
	expect(readSpotRemoval({ Spot_removal: { Enabled: true, Spot2: '1;2;3;4;5;1;1;' } }).entries).toEqual([]);
	for (const value of ['1;2;', '1;2;3;4;5;;1;', 'NaN;2;3;4;5;1;1;', '1;2;3;4;Infinity;1;1;']) {
		expect(readSpotRemoval({ Spot_removal: { Spot1: value } }).entries).toEqual([]);
	}
	expect(readSpotRemoval({})).toEqual({ enabled: false, entries: [] });
});

test('full-size export scales preview TIFF coordinates, not cropped JPEG coordinates', () => {
	const pp3 = parsePP3(profile);
	pp3.Crop = { Enabled: true, X: 100, Y: 40, W: 700, H: 400 };
	pp3.Rotation = { Degree: 7 };
	const mapped = mapSpotRemovalToTarget(pp3, 1000, 667, 6000, 4002);
	expect(readSpotRemoval(mapped).entries[0]).toEqual({
		source: { x: 720, y: 480 },
		target: { x: 2580, y: 1260 },
		radius: 72,
		feather: 0.75,
		opacity: 0.6
	});
	expect(mapped.Crop).toEqual(pp3.Crop);
	expect(mapped.Rotation).toEqual(pp3.Rotation);
	expect(readSpotRemoval(pp3).entries[0].radius).toBe(12);
	const roundTrip = mapSpotRemovalToTarget(mapped, 6000, 4002, 1000, 667);
	expect(readSpotRemoval(roundTrip)).toEqual(readSpotRemoval(pp3));
});

test('quarter turns swap scale axes; flips and crop do not add offsets', () => {
	for (const angle of [90, 270, -90]) {
		const pp3 = parsePP3(profile);
		pp3.Coarse_Transformation = { Rotate: angle, HorizontalFlip: true, VerticalFlip: true };
		// Exaggerated axis difference makes an incorrect pre-coarse mapping visible.
		const mapped = mapSpotRemovalToTarget(pp3, 1000, 500, 2000, 1500);
		expect(readSpotRemoval(mapped).entries[0]).toEqual({
			source: { x: 360, y: 160 },
			target: { x: 1290, y: 420 },
			radius: 24,
			feather: 0.75,
			opacity: 0.6
		});
	}
});

test('honours RT radius limits and rejects non-finite writes', () => {
	const pp3 = parsePP3(profile);
	const settings = readSpotRemoval(pp3);
	settings.entries[0].radius = 100;
	const large = writeSpotRemoval(pp3, settings);
	expect(readSpotRemoval(mapSpotRemovalToTarget(large, 1000, 500, 6000, 3000)).entries[0].radius).toBe(400);
	expect(readSpotRemoval(mapSpotRemovalToTarget(pp3, 1000, 500, 10, 5)).entries[0].radius).toBe(1);
	settings.entries[0].source.x = NaN;
	expect(() => writeSpotRemoval(pp3, settings)).toThrow(RangeError);
	for (const size of [0, -1, NaN, Infinity]) {
		expect(mapSpotRemovalToTarget(pp3, size, 500, 6000, 3000)).toBe(pp3);
	}
});

test('spot profiles always route to the reference renderer', () => {
	expect(supportsWasmPreview(profile)).toBe(false);
	expect(supportsWasmPreview('[Spot removal]\nEnabled=false')).toBe(false);
	expect(supportsWasmPreview('[Exposure]\nCompensation=0.5')).toBe(true);
});
