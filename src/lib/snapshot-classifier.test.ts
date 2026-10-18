import { describe, expect, test } from 'bun:test';
import { changedStructuralChapters, pp3EditDistance, snapshotDecision, SNAPSHOT_DISTANCE, SNAPSHOT_INTERVAL_MS } from './snapshot-classifier';

describe('edit distance', () => {
	test('measures slider movement against its own value', () => {
		expect(pp3EditDistance({ Exposure: { Compensation: 0 } }, { Exposure: { Compensation: 0 } })).toBe(0);
		expect(pp3EditDistance({ Exposure: { Compensation: 0 } }, { Exposure: { Compensation: 0.4 } })).toBeCloseTo(0.4);
		expect(pp3EditDistance({ Exposure: { Compensation: 1 } }, { Exposure: { Compensation: 0.5 } })).toBeCloseTo(0.5);
	});

	test('measures large fields by their natural range', () => {
		expect(pp3EditDistance({ White_Balance: { Temperature: 5500 } }, { White_Balance: { Temperature: 5600 } })).toBeCloseTo(0.2);
		expect(pp3EditDistance({ PCVignette: { Feather: 50 } }, { PCVignette: { Feather: 100 } })).toBeCloseTo(1);
		expect(pp3EditDistance({ Dehaze: { Depth: 25 } }, { Dehaze: { Depth: 75 } })).toBeCloseTo(0.67);
	});

	test('counts curves, names and removed fields as whole steps', () => {
		expect(pp3EditDistance({ Exposure: { Curve2: '0;' } }, { Exposure: { Curve2: '0;50;100;' } })).toBe(1);
		// Removing the look is structural on its own; its strength counts as one step of tuning
		expect(pp3EditDistance({ Film_Simulation: { ClutFilename: '/a.png', Strength: 100 } }, {})).toBe(1);
		expect(pp3EditDistance({ Exposure: { Compensation: 0 } }, {})).toBe(1);
	});

	test('caches disabled toggles cheaply and structural chapters not at all', () => {
		expect(pp3EditDistance({ Sharpen: { Enabled: false } }, { Sharpen: { Enabled: true } })).toBe(0.25);
		expect(pp3EditDistance({ Locallab: { Enabled: false } }, { Locallab: { Enabled: true } })).toBe(0);
		expect(pp3EditDistance({ Crop: { X: 0, W: 400 } }, { Crop: { X: 500, W: 900 } })).toBe(0);
	});

	test('no single field can outvote the whole edit', () => {
		expect(pp3EditDistance({ Exposure: { Compensation: 0 } }, { Exposure: { Compensation: 100000 } })).toBe(1);
	});
});

describe('structural changes', () => {
	test('reports geometry, look, mask and retouch chapters', () => {
		expect(changedStructuralChapters({ Crop: { X: 0 } }, { Crop: { X: 10 } })).toEqual(['Crop']);
		expect(changedStructuralChapters({ Exposure: { Compensation: 0 } }, { Film_Simulation: { ClutFilename: '/a.png' } })).toEqual(['Film_Simulation']);
		expect(changedStructuralChapters({ Spot_removal: { Enabled: false } }, { Spot_removal: { Enabled: true } })).toEqual(['Spot_removal']);
		expect(changedStructuralChapters({ Locallab: { Enabled: false } }, { Locallab: { Enabled: true, Shape_0: 'RECT' } })).toEqual(['Locallab']);
		expect(changedStructuralChapters({ 'Black_&_White': { Enabled: false } }, { 'Black_&_White': { Enabled: true } })).toEqual(['Black_&_White']);
	});

	test('adding, removing or reshaping a mask is structural', () => {
		const one = { Locallab: { Enabled: true, Shape_0: 'RECT', Expcomp_0: 0 } };
		expect(changedStructuralChapters(one, { Locallab: { ...one.Locallab, Shape_1: 'ELI', Expcomp_1: 0 } })).toEqual(['Locallab']);
		expect(changedStructuralChapters(one, { Locallab: { ...one.Locallab, Shape_0: 'ELI' } })).toEqual(['Locallab']);
		expect(changedStructuralChapters(one, { Locallab: { Enabled: false } })).toEqual(['Locallab']);
	});

	test('tuning a mask, a look or retouch is not structural', () => {
		const mask = { Locallab: { Enabled: true, Selspot: 0, Shape_0: 'RECT', Expcomp_0: 0, Loc_0: '500;500;500;500;' } };
		expect(changedStructuralChapters(mask, { Locallab: { ...mask.Locallab, Expcomp_0: 0.6, Loc_0: '400;600;500;500;', Selspot: 1 } })).toEqual([]);
		const look = { Film_Simulation: { Enabled: true, ClutFilename: '/a.png', Strength: 100 } };
		expect(changedStructuralChapters(look, { Film_Simulation: { ...look.Film_Simulation, Strength: 60 } })).toEqual([]);
		const spots = { Spot_removal: { Enabled: true, Spot1: '1;2;3;4;20;0.5;1;' } };
		expect(changedStructuralChapters(spots, { Spot_removal: { ...spots.Spot_removal, Spot2: '5;6;7;8;20;0.5;1;' } })).toEqual([]);
	});

	test('tuning inside a mask or look counts as at most one step', () => {
		const mask = { Locallab: { Enabled: true, Shape_0: 'RECT', Expcomp_0: 0, Chroma_0: 0, Lightness_0: 0 } };
		expect(pp3EditDistance(mask, { Locallab: { ...mask.Locallab, Expcomp_0: 0.3 } })).toBeCloseTo(0.3);
		expect(pp3EditDistance(mask, { Locallab: { ...mask.Locallab, Expcomp_0: 2, Chroma_0: 40, Lightness_0: 40 } })).toBe(1);
	});

	test('lists of numbers count by how far they moved', () => {
		expect(pp3EditDistance({ Channel_Mixer: { Red: '1000;0;0;' } }, { Channel_Mixer: { Red: '1100;0;0;' } })).toBeCloseTo(100 / 1100);
		expect(pp3EditDistance({ Exposure: { Curve: '1;0;0;0.5;0.5;1;1;' } }, { Exposure: { Curve: '1;0;0;0.5;0.6;1;1;' } })).toBeCloseTo(0.1);
	});

	test('ignores ordinary adjustments', () => {
		expect(changedStructuralChapters({ Exposure: { Compensation: 0 }, Sharpening: { Amount: 10 } }, { Exposure: { Compensation: 0.5 }, Sharpening: { Amount: 20 } })).toEqual([]);
	});

	test('treats removed structural chapters as changes', () => {
		expect(changedStructuralChapters({ Crop: { X: 0 } }, {})).toEqual(['Crop']);
	});
});

describe('snapshot decision', () => {
	const recent = { hasSnapshot: true, ageMs: 60_000, exported: false, structural: false, distance: 0.2 };

	test('updates the latest snapshot for small tweaks in a recent version', () => {
		expect(snapshotDecision(recent)).toBe('update');
		expect(snapshotDecision({ ...recent, distance: SNAPSHOT_DISTANCE - 0.01 })).toBe('update');
	});

	test('creates a version for the first edit, long edits, exports and structure', () => {
		expect(snapshotDecision({ ...recent, hasSnapshot: false })).toBe('create');
		expect(snapshotDecision({ ...recent, ageMs: SNAPSHOT_INTERVAL_MS })).toBe('create');
		expect(snapshotDecision({ ...recent, ageMs: Number.NaN })).toBe('create');
		expect(snapshotDecision({ ...recent, exported: true })).toBe('create');
		expect(snapshotDecision({ ...recent, structural: true })).toBe('create');
		expect(snapshotDecision({ ...recent, distance: SNAPSHOT_DISTANCE })).toBe('create');
	});

	test('an untrusted age cannot force unbounded updates', () => {
		expect(snapshotDecision({ ...recent, ageMs: -1 })).toBe('update');
	});
});
