import { expect, test } from 'bun:test';
import { UploadConcurrency } from './upload-concurrency';

test('starts with one upload and increases gradually after measured throughput', () => {
	const policy = new UploadConcurrency();
	policy.reset(0);
	expect(policy.sample(20_000_000, 100_000_000, true, 2000)).toBe(1);
	expect(policy.sample(40_000_000, 100_000_000, true, 4000)).toBe(1);
	expect(policy.sample(60_000_000, 100_000_000, true, 6000)).toBe(2);
	expect(policy.sample(80_000_000, 100_000_000, true, 8000)).toBe(3);
});

test('large RAW files stay sequential on a slow connection', () => {
	const policy = new UploadConcurrency();
	policy.reset(0);
	for (let seconds = 2; seconds <= 20; seconds += 2) {
		expect(policy.sample(seconds * 100_000, 50_000_000, true, seconds * 1000)).toBe(1);
	}
});

test('aggregate bandwidth allows smaller files to overlap but reacts to stalls', () => {
	const policy = new UploadConcurrency();
	policy.reset(0);
	policy.sample(2_000_000, 10_000_000, true, 2000);
	policy.sample(4_000_000, 10_000_000, true, 4000);
	expect(policy.sample(6_000_000, 10_000_000, true, 6000)).toBe(2);
	expect(policy.sample(8_000_000, 10_000_000, true, 8000)).toBe(3);
	expect(policy.sample(8_000_000, 10_000_000, true, 10000)).toBe(1);
});

test('preparation and server idle time are excluded and new batches recalibrate', () => {
	const policy = new UploadConcurrency();
	policy.reset(0);
	expect(policy.sample(0, 100_000_000, false, 60000)).toBe(1);
	expect(policy.sample(20_000_000, 100_000_000, true, 62000)).toBe(1);
	expect(policy.sample(40_000_000, 100_000_000, true, 64000)).toBe(1);
	expect(policy.sample(60_000_000, 100_000_000, true, 66000)).toBe(2);
	policy.reset(70000);
	expect(policy.sample(2000, 100_000_000, true, 72000)).toBe(1);
});
