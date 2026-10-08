import { applyPP3Diff, type PP3 } from '../../src/lib/pp3-utils';
export function buildScenarios(application: PP3, width: number, height: number, lut?: string) {
	const base = applyPP3Diff(structuredClone(application), {
		Exposure: { Auto: false, Compensation: 0 },
		White_Balance: { Enabled: true, Setting: 'Custom', Temperature: 6504, Green: 1 },
		Film_Simulation: { Enabled: false }
	});
	const changes: [string, PP3][] = [
		['baseline', {}],
		['auto-exposure', { Exposure: { Auto: true, Clip: 0.02 } }],
		['auto-exposure-clip', { Exposure: { Auto: true, Clip: 0.1 } }],
		['exposure', { Exposure: { Compensation: 1 } }],
		['exposure-negative', { Exposure: { Compensation: -1 } }],
		['wb-cool', { White_Balance: { Temperature: 4500 } }],
		['wb-warm', { White_Balance: { Temperature: 8500 } }],
		['tint', { White_Balance: { Green: 1.2 } }],
		['tint-low', { White_Balance: { Green: 0.8 } }],
		['contrast', { Exposure: { Contrast: 25 } }],
		['contrast-negative', { Exposure: { Contrast: -25 } }],
		['saturation', { Exposure: { Saturation: 25 } }],
		['rotation90', { Coarse_Transformation: { Rotate: 90 } }],
		['crop', { Crop: { Enabled: true, X: Math.floor(width / 8), Y: Math.floor(height / 8), W: Math.floor(width / 2), H: Math.floor(height / 2), FixedRatio: false } }],
		['sharpening', { Sharpening: { Enabled: true, Method: 'usm', Radius: 0.8, Amount: 100 } }]
	];
	if (lut) for (const strength of [0, 50, 100]) changes.push([`lut-${strength}`, { Film_Simulation: { Enabled: true, Strength: strength, ClutFilename: lut } }]);
	if (lut) changes.push(['lut-disabled', { Film_Simulation: { Enabled: false, Strength: 100, ClutFilename: lut } }]);
	return [{ name: 'application-profile', pp3: structuredClone(application) }, ...changes.map(([name, diff]) => ({ name, pp3: applyPP3Diff(structuredClone(base), diff) }))];
}
