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
		expect(pp3EditDistance({ Film_Simulation: { ClutFilename: '/a.png', Strength: 100 } }, {})).toBe(0);
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
		expect(changedStructuralChapters({ Locallab: { Enabled: false } }, { Locallab: { Selspot: 1 } })).toEqual(['Locallab']);
		expect(changedStructuralChapters({ 'Black_&_White': { Enabled: false } }, { 'Black_&_White': { Enabled: true } })).toEqual(['Black_&_White']);
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
