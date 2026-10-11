import { expect, test } from 'bun:test';
import { EditPreviewScheduler } from './edit-preview-scheduler';
import type { PP3 } from './pp3-utils';

test('publishes only the latest immutable edit after the throttle interval', async () => {
	const published: PP3[] = [];
	const scheduler = new EditPreviewScheduler((settings) => published.push(settings), 10);
	try {
		scheduler.reset({ Exposure: { Compensation: 0 } });
		scheduler.update({ Exposure: { Compensation: 1 } });
		const latest = { Exposure: { Compensation: 2 } };
		scheduler.update(latest);
		latest.Exposure.Compensation = 3;
		await Bun.sleep(30);
		expect(published).toEqual([{ Exposure: { Compensation: 0 } }, { Exposure: { Compensation: 2 } }]);
	} finally { scheduler.cancel(); }
});

test('reset discards edits queued for the previous image', async () => {
	const published: PP3[] = [];
	const scheduler = new EditPreviewScheduler((settings) => published.push(settings), 10);
	try {
		scheduler.reset({ Exposure: { Compensation: 0 } });
		scheduler.update({ Exposure: { Compensation: 1 } });
		scheduler.reset({ Exposure: { Compensation: -1 } });
		await Bun.sleep(30);
		expect(published).toEqual([{ Exposure: { Compensation: 0 } }, { Exposure: { Compensation: -1 } }]);
	} finally { scheduler.cancel(); }
});

test('returning to the published edit cancels a pending update, including removed settings', async () => {
	const published: PP3[] = [];
	const scheduler = new EditPreviewScheduler((settings) => published.push(settings), 10);
	try {
		scheduler.reset({ Exposure: { Compensation: 0 }, Dehaze: { Enabled: false } });
		scheduler.update({ Exposure: { Compensation: 0 } });
		scheduler.update({ Exposure: { Compensation: 0 }, Dehaze: { Enabled: false } });
		await Bun.sleep(30);
		expect(published).toHaveLength(1);
	} finally { scheduler.cancel(); }
});
