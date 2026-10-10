import { describe, expect, test } from 'bun:test';
import { previewDevice, previewQuality } from './editor-preview-policy';

describe('editor preview budgets', () => {
	test('uses screen class unless resource or data constraints require a smaller budget', () => {
		expect(previewDevice({ width: 390, cores: 8 })).toBe('mobile');
		expect(previewDevice({ width: 820 })).toBe('tablet');
		expect(previewDevice({ width: 1440 })).toBe('desktop');
		for (const constraint of [{ saveData: true }, { memory: 2 }, { cores: 2 }, { connection: '2g' }, { connection: '3g' }, { connectionType: 'cellular' }]) {
			expect(previewDevice({ width: 1440, ...constraint })).toBe('constrained');
		}
	});

	test('preserves the initial preview and refines quality without reducing resolution', () => {
		for (const device of ['mobile', 'tablet', 'desktop', 'constrained']) {
			const quick = previewQuality(device, 'quick');
			const final = previewQuality(device, 'final');
			expect(quick.quality).toBe(85);
			expect(quick.size).toBe(1000);
			expect(final.size).toBeGreaterThanOrEqual(quick.size);
			expect(quick.quality).toBeLessThan(final.quality);
			expect(final.size).toBeLessThanOrEqual(2560);
		}
	});

	test('untrusted device values cannot request arbitrary rendering budgets', () => {
		for (const device of [null, 'unexpected', '__proto__', 'constructor', '999999']) {
			expect(previewQuality(device, 'final')).toEqual(previewQuality('desktop', 'final'));
		}
	});

	test('constrained devices refine less aggressively and wait longer', () => {
		const constrained = previewQuality('constrained', 'final');
		const desktop = previewQuality('desktop', 'final');
		expect(constrained.quality).toBeLessThan(desktop.quality);
		expect(constrained.settleDelay).toBeGreaterThan(desktop.settleDelay);
	});
});
