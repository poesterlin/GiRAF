import { expect, test } from 'bun:test';
import { createEditDocument, scaleEditSettings } from './edit-strength';
import { restoreGroupedSettings } from './adjustment-groups';
import { parsePP3Document, stringifyPP3Document } from './pp3-document';
import { parsePP3, type PP3 } from './pp3-utils';
import { curveSamples, readToneCurve } from './tone-curve';
import { lutPreviewSettings } from './lut-preview';

const settings: PP3 = {
	Exposure: { Auto: false, Compensation: 2, Contrast: -20, Saturation: 30, Black: -1200, HighlightCompr: 40, HighlightComprThreshold: 60, Curve2: '1;0;0;0.5;0.8;1;1;' },
	Film_Simulation: { Enabled: true, ClutFilename: '/film.png', Strength: 80 },
	PCVignette: { Enabled: true, Strength: -4, Feather: 60, Roundness: 70 },
	Local_Contrast: { Enabled: true, Amount: 0.4, Radius: 80, Darkness: 1.2, Lightness: 0.8 },
	Sharpening: { Enabled: true, Amount: 90, Radius: 0.7 },
	Channel_Mixer: { Enabled: true, Red: '1200;-100;-100;', Green: '0;1000;0;', Blue: '0;0;1000;' },
	HSV_Equalizer: { Enabled: true, HCurve: '1;0;0.7;0.35;0.35;0.5;0.3;0.35;0.35;' },
	White_Balance: { Setting: 'Custom', Temperature: 6000, Green: 1.44 },
	Crop: { Enabled: true, X: 10, Y: 20, W: 300, H: 200 },
	Rotation: { Degree: 2 },
	Coarse_Transformation: { Rotate: 90, HorizontalFlip: true },
	Spot_removal: { Enabled: true, Spots: '100;100;200;200;20;0.5;1;' }
};

test('half strength scales amounts but preserves shape controls, geometry and retouching', () => {
	const original = structuredClone(settings);
	const scaled = scaleEditSettings(settings, 50, { temperature: 4000, green: 1 });
	expect(scaled.Exposure.Compensation).toBe(1);
	expect(scaled.Exposure.Black).toBe(-600);
	expect(scaled.Exposure.Contrast).toBe(-10);
	expect(scaled.Exposure.HighlightComprThreshold).toBe(60);
	expect(scaled.Film_Simulation.Strength).toBe(40);
	expect(scaled.PCVignette).toEqual({ Enabled: true, Strength: -2, Feather: 60, Roundness: 70 });
	expect(scaled.Local_Contrast).toEqual({ Enabled: true, Amount: 0.2, Radius: 80, Darkness: 1.2, Lightness: 0.8 });
	expect(scaled.Sharpening).toEqual({ Enabled: true, Amount: 45, Radius: 0.7 });
	expect(readToneCurve(scaled.Exposure.Curve2)![1]).toEqual({ x: 0.5, y: 0.65 });
	expect(scaled.Channel_Mixer.Red).toBe('1100;-50;-50;');
	expect(scaled.HSV_Equalizer.HCurve).toBe('1;0;0.6;0.35;0.35;0.5;0.4;0.35;0.35;');
	expect(scaled.White_Balance.Temperature).toBe(4800);
	expect(scaled.White_Balance.Green as number).toBeCloseTo(1.2);
	for (const chapter of ['Crop', 'Rotation', 'Coarse_Transformation', 'Spot_removal']) expect(scaled[chapter]).toEqual(settings[chapter]);
	expect(settings).toEqual(original);
});

test('zero strength bypasses adjustable tools while retaining retouching; 100% is exact', () => {
	const zero = scaleEditSettings({ ...settings, Exposure: { ...settings.Exposure, Auto: true } }, 0);
	expect(zero.Exposure.Auto).toBe(false);
	expect(zero.Exposure.Compensation).toBe(0);
	expect(zero.Exposure.Curve2).toBe('0;');
	expect(zero.White_Balance.Setting).toBe('Camera');
	for (const chapter of ['Film_Simulation', 'PCVignette', 'Sharpening', 'Channel_Mixer', 'HSV_Equalizer', 'Local_Contrast']) expect(zero[chapter].Enabled).toBe(false);
	expect(zero.Spot_removal).toEqual(settings.Spot_removal);
	expect(scaleEditSettings(settings, 100)).toEqual(settings);
	expect(scaleEditSettings(settings, 120)).toEqual(settings);
	expect(scaleEditSettings(settings, NaN)).toEqual(settings);
});

test('serialized snapshots render scaled settings and restore original edits without double scaling', () => {
	let raw = settings;
	for (let i = 0; i < 3; i++) {
		const serialized = stringifyPP3Document(createEditDocument(raw, ['vignette'], 50));
		const render = parsePP3(serialized); // The export and reference-preview pipeline reads this body.
		expect(render.Exposure.Compensation).toBe(1);
		expect(render.PCVignette.Enabled).toBe(false);
		expect(render.Spot_removal).toEqual(settings.Spot_removal);
		const document = parsePP3Document(serialized);
		expect(document.ui!.editStrength).toBe(50);
		expect(document.ui!.disabledGroups).toEqual(['vignette']);
		raw = restoreGroupedSettings(document);
		expect(raw).toEqual(settings);
	}
	expect(createEditDocument(raw, [], 100).settings).toEqual(settings);
});

test('LUT previews apply global strength exactly once and preserve other section bypasses', () => {
	const candidate = lutPreviewSettings(settings, ['look', 'toneCurve'], '/new.png', 25);
	expect(candidate.Film_Simulation).toEqual({ Enabled: true, ClutFilename: '/new.png', Strength: 25 });
	expect(candidate.Exposure.Compensation).toBe(0.5);
	expect(candidate.Exposure.Curve2).toBe('0;');
	expect(candidate.Spot_removal).toEqual(settings.Spot_removal);
});

test('strength metadata rejects invalid values and older snapshots default to full strength', () => {
	for (const editStrength of [-1, 101, NaN, Infinity]) {
		const document = createEditDocument(settings, []);
		document.ui!.editStrength = editStrength;
		expect(() => stringifyPP3Document(document)).toThrow('Invalid GiRAF edit strength');
	}
	expect(parsePP3Document('[Exposure]\nCompensation=1').ui?.editStrength ?? 100).toBe(100);
});

test('95% produces integer-safe PP3 amounts without rounding continuous controls', () => {
	const original: PP3 = {
		Exposure: { Compensation: 0.763876, Brightness: 1, Contrast: 22, Saturation: 19, HighlightCompr: 75, Black: -123, ShadowCompr: 17 },
		Vibrance: { Pastels: -49, Saturated: 7 },
		'Shadows_&_Highlights': { Highlights: 7, Shadows: 13 },
		Dehaze: { Strength: 18 },
		Film_Simulation: { Strength: 81 },
		Sharpening: { Amount: 13 },
		Local_Contrast: { Amount: 0.08 },
		PCVignette: { Strength: 0.89 }
	};
	const scaled = scaleEditSettings(original, 95);
	expect(scaled.Exposure.Brightness).toBe(1);
	expect(scaled.Exposure.Contrast).toBe(21);
	expect(scaled.Exposure.Saturation).toBe(18);
	expect(scaled.Exposure.HighlightCompr).toBe(71);
	expect(scaled.Vibrance.Pastels).toBe(-47);
	expect(scaled.Dehaze.Strength).toBe(17);
	for (const [chapter, values] of Object.entries(scaled)) {
		for (const [field, value] of Object.entries(values)) {
			if (field === 'Compensation' || chapter === 'Local_Contrast' || chapter === 'PCVignette') continue;
			expect(Number.isInteger(value)).toBe(true);
		}
	}
	expect(scaled.Exposure.Compensation as number).toBeCloseTo(0.7256822);
	expect(scaled.Local_Contrast.Amount as number).toBeCloseTo(0.076);
	expect(scaled.PCVignette.Strength as number).toBeCloseTo(0.8455);
	expect(restoreGroupedSettings(createEditDocument(original, [], 95))).toEqual(original);
});

test('inset curve endpoints fade toward identity over the entire input range', () => {
	const curve = '1;0.098114;0;0.331823;0.257903;0.639146;0.588192;0.930445;1;';
	const original: PP3 = { Exposure: { Curve2: curve } };
	const baseline = curveSamples(readToneCurve(curve)!);
	for (const percent of [95, 50, 1]) {
		const scaled = scaleEditSettings(original, percent);
		const points = readToneCurve(scaled.Exposure.Curve2)!;
		expect(points[0].x).toBe(0);
		expect(points.at(-1)!.x).toBe(1);
		const samples = curveSamples(points);
		for (const i of [0, 8, 16, 64, 128, 192, 248, 256]) {
			const { x, y } = baseline[i];
			expect(samples[i].y).toBeCloseTo(x + percent / 100 * (y - x), 5);
		}
		if (percent === 1) expect(samples.every(({ x, y }) => Math.abs(y - x) <= 0.010001)).toBe(true);
	}
	expect(scaleEditSettings(original, 100).Exposure.Curve2).toBe(curve);
	expect(scaleEditSettings(original, 0).Exposure.Curve2).toBe('0;');
});
