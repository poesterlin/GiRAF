import { expect, test } from 'bun:test';
import { resetEditorTool } from './editor-reset';
import type { PP3 } from './pp3-utils';

const current: PP3 = {
	Exposure: { Compensation: 1 }, Crop: { Enabled: true, X: 100 }, Rotation: { Degree: 12 },
	Spot_removal: { Enabled: true, Spots: 'existing spots' },
	Locallab: { Enabled: true, Selspot: 0, Name_0: 'Mask', Expcomp_0: .5 }
};
const baseline: PP3 = { Exposure: { Compensation: 0 }, Crop: { Enabled: true, X: 999 } };
const neutral: PP3 = { Rotation: { Degree: 0 } };

test('crop reset clears crop and rotation while preserving adjustment, retouch, and mask edits', () => {
	const reset = resetEditorTool(current, baseline, 'crop', neutral);
	expect(reset.Crop).toBeUndefined(); expect(reset.Rotation).toEqual(neutral.Rotation);
	expect(reset.Exposure).toEqual(current.Exposure); expect(reset.Spot_removal).toEqual(current.Spot_removal);
	expect(reset.Locallab).toEqual(current.Locallab);
	expect(current.Rotation.Degree).toBe(12);
});
test('retouch and mask resets leave all other tools intact', () => {
	const retouch = resetEditorTool(current, baseline, 'retouch', neutral);
	expect(retouch.Spot_removal).toBeUndefined(); expect(retouch.Locallab).toEqual(current.Locallab);
	const masks = resetEditorTool(current, baseline, 'masks', neutral);
	expect(masks.Locallab).toEqual({ Enabled: false, Selspot: 0 }); expect(masks.Spot_removal).toEqual(current.Spot_removal);
	for (const reset of [retouch, masks]) { expect(reset.Crop).toEqual(current.Crop); expect(reset.Rotation).toEqual(current.Rotation); expect(reset.Exposure).toEqual(current.Exposure); }
});
test('adjustments reset restores baseline but keeps tool edits and does not introduce baseline crops', () => {
	const reset = resetEditorTool(current, baseline, 'adjustments', neutral);
	expect(reset.Exposure).toEqual(baseline.Exposure);
	for (const key of ['Crop', 'Rotation', 'Spot_removal', 'Locallab']) expect(reset[key]).toEqual(current[key]);
	expect(resetEditorTool({}, baseline, 'adjustments', neutral).Crop).toBeUndefined();
});
