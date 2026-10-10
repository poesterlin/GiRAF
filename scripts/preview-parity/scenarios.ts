import { applyPP3Diff, type PP3 } from '../../src/lib/pp3-utils';
import { gradeToRgb } from '../../src/lib/color-controls';
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
		['exposure-strong-positive', { Exposure: { Compensation: 3 } }],
		['exposure-strong-negative', { Exposure: { Compensation: -3 } }],
		['wb-cool', { White_Balance: { Temperature: 4500 } }],
		['wb-warm', { White_Balance: { Temperature: 8500 } }],
		['wb-tungsten', { White_Balance: { Temperature: 3000 } }],
		['wb-shade', { White_Balance: { Temperature: 12000 } }],
		['tint', { White_Balance: { Green: 1.2 } }],
		['tint-low', { White_Balance: { Green: 0.8 } }],
		['contrast', { Exposure: { Contrast: 25 } }],
		['contrast-negative', { Exposure: { Contrast: -25 } }],
		['brightness-positive', { Exposure: { Brightness: 20 } }],
		['brightness-negative', { Exposure: { Brightness: -20 } }],
		['black-point', { Exposure: { Black: 2048 } }],
		['highlight-compression', { Exposure: { Compensation: 1, HighlightCompr: 50, HighlightComprThreshold: 0 } }],
		['shadow-compression', { Exposure: { Black: 2048, ShadowCompr: 40 } }],
		['custom-curve', { Exposure: { Curve: '2;0;0;0.5;0.6;1;1;' } }],
		['saturation', { Exposure: { Saturation: 25 } }],
		['mixer-red', { Channel_Mixer: { Enabled: true, Red: '1100;-50;-50;', Green: '0;1000;0;', Blue: '0;0;1000;' } }],
		['mixer-cross', { Channel_Mixer: { Enabled: true, Red: '800;150;50;', Green: '50;900;50;', Blue: '100;-100;1000;' } }],
		['mixer-combined', { Channel_Mixer: { Enabled: true, Red: '1100;-50;-50;', Green: '0;1000;0;', Blue: '0;0;1000;' }, Exposure: { Compensation: 1, Contrast: 20, Saturation: 15 }, White_Balance: { Temperature: 4500, Green: 1.1 } }],
		['mixer-disabled', { Channel_Mixer: { Enabled: false, Red: '800;150;50;' } }],
		['rotation90', { Coarse_Transformation: { Rotate: 90 } }],
		['straighten-positive', { Rotation: { Enabled: true, Degree: 5 } }],
		['straighten-negative', { Rotation: { Enabled: true, Degree: -5 } }],
		[
			'straighten-crop',
			{
				Rotation: { Enabled: true, Degree: 3 },
				Crop: { Enabled: true, X: Math.floor(width / 8), Y: Math.floor(height / 8), W: Math.floor(width / 2), H: Math.floor(height / 2), FixedRatio: false }
			}
		],
		['crop', { Crop: { Enabled: true, X: Math.floor(width / 8), Y: Math.floor(height / 8), W: Math.floor(width / 2), H: Math.floor(height / 2), FixedRatio: false } }],
		['sharpening', { Sharpening: { Enabled: true, Method: 'usm', Radius: 0.8, Amount: 100 } }]
	];
	if (lut) for (const strength of [0, 50, 100]) changes.push([`lut-${strength}`, { Film_Simulation: { Enabled: true, Strength: strength, ClutFilename: lut } }]);
	for (let primary = 0; primary < 3; primary++) {
		for (const [hue, saturation] of [[-100, 0], [100, 0], [0, -100], [0, 100], [100, 100], [-20, 0], [20, 0], [0, -20], [0, 20], [20, 20]]) {
			const column = gradeToRgb(primary * 120 + hue * 0.3, 1000 * (1 + saturation / 200));
			const mixer: PP3[string] = { Enabled: true };
			for (const [row, key] of ['Red', 'Green', 'Blue'].entries()) {
				const values = [0, 0, 0];
				values[row] = 1000;
				values[primary] = Math.round(column[row] + 1000 / 3);
				mixer[key] = `${values.join(';')};`;
			}
			changes.push([`calibration-${primary}-${hue}-${saturation}`, { Channel_Mixer: mixer }]);
		}
	}
	if (lut) changes.push(['lut-disabled', { Film_Simulation: { Enabled: false, Strength: 100, ClutFilename: lut } }]);
	return [{ name: 'application-profile', pp3: structuredClone(application) }, ...changes.map(([name, diff]) => ({ name, pp3: applyPP3Diff(structuredClone(base), diff) }))];
}
