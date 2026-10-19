import type { PP3 } from './pp3-utils';

export type MaskToolControl = {
	/** Locallab setting name, without the trailing spot index. */
	key: string;
	label: string;
	min: number;
	max: number;
	step?: number;
	/** Value a fresh mask gets and a double tap returns to. */
	reset: number;
	centered?: boolean;
	precision?: number;
	unit?: string;
	/** The slider shows the setting negated, where RawTherapee's direction reads backwards. */
	invert?: boolean;
};

export type MaskTool = {
	/** The Locallab flag that turns this tool on. */
	enable: string;
	label: string;
	/**
	 * Settings the tool needs written beside it, such as which method it uses. RawTherapee's
	 * defaults are not always what the editor's sliders assume: Shadow/Highlights defaults to the
	 * Michaelis-Menten method and Local Contrast to a method its own GUI does not offer.
	 */
	settings?: Record<string, string>;
	controls: MaskToolControl[];
};

/**
 * Per-mask tools beyond the basic sliders, in the order they appear. Everything here is a
 * RawTherapee Locallab tool that stays off until it is turned on, so a mask that only uses the
 * basic sliders renders exactly as it did before. Measured against a developed TIFF, each tool
 * below changes the photo; RawTherapee's per-mask denoise does not respond to its settings there,
 * so it is left out.
 */
export const maskTools: MaskTool[] = [
	{
		enable: 'Expvibrance',
		label: 'Warm & colour',
		controls: [
			{ key: 'Warm', label: 'Warm / cool', min: -100, max: 100, reset: 0, centered: true },
			{ key: 'Pastels', label: 'Vibrance', min: -100, max: 100, reset: 0, centered: true },
			{ key: 'Saturated', label: 'Saturation', min: -100, max: 100, reset: 0, centered: true }
		]
	},
	{
		enable: 'Expshadhigh',
		label: 'Shadows & highlights',
		settings: { ShMethod: 'std' },
		controls: [
			{ key: 'shadows', label: 'Shadows', min: 0, max: 100, reset: 0 },
			{ key: 'highlights', label: 'Highlights', min: 0, max: 100, reset: 0 }
		]
	},
	{
		enable: 'Expcontrast',
		label: 'Clarity',
		settings: { localcontMethod: 'loc' },
		controls: [
			{ key: 'Lcamount', label: 'Amount', min: 0, max: 1, step: 0.01, reset: 0, precision: 2 },
			{ key: 'Lcradius', label: 'Radius', min: 10, max: 100, reset: 80 }
		]
	},
	{
		enable: 'Expreti',
		label: 'Dehaze',
		controls: [
			{ key: 'Dehaz', label: 'Strength', min: -100, max: 100, reset: 0, centered: true },
			{ key: 'Depth', label: 'Depth', min: 0, max: 100, reset: 25 }
		]
	},
	{
		enable: 'Expsharp',
		label: 'Sharpening',
		settings: { methodcap: 'rl' },
		controls: [
			{ key: 'Sharamount', label: 'Amount', min: 1, max: 100, reset: 50 },
			{ key: 'Sharradius', label: 'Radius', min: 0.4, max: 2.5, step: 0.01, reset: 0.75, precision: 2 }
		]
	}
];

/** Every tool's neutral values, so a fresh mask says which tools it is not using. */
export function maskToolDefaults(): Record<string, string | number | boolean> {
	const defaults: Record<string, string | number | boolean> = {};
	for (const tool of maskTools) {
		defaults[tool.enable] = false;
		Object.assign(defaults, tool.settings ?? {});
		for (const control of tool.controls) if (!(control.key in defaults)) defaults[control.key] = control.reset;
	}
	return defaults;
}

/**
 * Turns one mask's tool on or off. A tool needs its method and its sliders written with it: older
 * masks, and the tools of RawTherapee's own editor, may not carry them.
 */
export function setMaskToolEnabled(settings: PP3, index: number, tool: MaskTool, enabled: boolean) {
	settings.Locallab ??= { Enabled: false, Selspot: 0 };
	for (const [key, value] of Object.entries(tool.settings ?? {})) {
		if (settings.Locallab[`${key}_${index}`] === undefined) settings.Locallab[`${key}_${index}`] = value;
	}
	for (const control of tool.controls) {
		if (settings.Locallab[`${control.key}_${index}`] === undefined) settings.Locallab[`${control.key}_${index}`] = control.reset;
	}
	settings.Locallab[`${tool.enable}_${index}`] = enabled;
}

/**
 * A gradient mask is a rectangle reaching far past every edge, so RawTherapee's Color & Light
 * gradient runs across the whole photo. Measured on a developed TIFF: a positive strength darkens
 * the side the angle points to (0° the top, 90° the left, 180° the bottom) and a negative chroma
 * strength makes it more colourful, the mask's centre sets where the transition sits, and RawTherapee's
 * hue gradient does not respond, so it is left out. Only these fade across the line: the mask's other
 * adjustments apply evenly over the whole photo.
 */
const GRADIENT_REACH = 3000;

export const gradientControls: MaskToolControl[] = [
	{ key: 'Strcol', label: 'Darken', min: -3, max: 3, step: 0.05, reset: 1, centered: true, precision: 2, unit: ' EV' },
	{ key: 'Strcolab', label: 'Colour', min: -3, max: 3, step: 0.05, reset: 0, centered: true, precision: 2, invert: true },
	{ key: 'Angcol', label: 'Angle', min: -180, max: 180, reset: 0, centered: true, unit: '°' },
	{ key: 'Feathercol', label: 'Feather', min: 10, max: 100, reset: 25 }
];

/** The size a mask gets when it is added, and again when it stops being a gradient. */
const DEFAULT_LOC = '500;500;500;500;';

export type MaskKind = 'ELI' | 'RECT' | 'GRADIENT';

export function maskKind(settings: PP3, index: number): MaskKind {
	if (isGradientMask(settings, index)) return 'GRADIENT';
	return settings.Locallab?.[`Shape_${index}`] === 'RECT' ? 'RECT' : 'ELI';
}

/**
 * Turns a mask into an ellipse, a rectangle or a gradient. A gradient reaches past every edge and
 * starts at a visible strength; a mask that stops being one gets the default size back and its
 * gradient switched off, so no hidden gradient stays behind in a region. The centre is kept.
 */
export function setMaskKind(settings: PP3, index: number, kind: MaskKind) {
	const locallab = settings.Locallab;
	const wasGradient = isGradientMask(settings, index);
	if (kind === 'GRADIENT') {
		if (wasGradient) return;
		locallab[`Shape_${index}`] = 'RECT';
		locallab[`Loc_${index}`] = `${GRADIENT_REACH};${GRADIENT_REACH};${GRADIENT_REACH};${GRADIENT_REACH};`;
		for (const control of gradientControls) locallab[`${control.key}_${index}`] = control.reset;
		return;
	}
	locallab[`Shape_${index}`] = kind;
	if (wasGradient) {
		locallab[`Loc_${index}`] = DEFAULT_LOC;
		locallab[`Strcol_${index}`] = 0;
		locallab[`Strcolab_${index}`] = 0;
	}
}

export function isGradientMask(settings: PP3, index: number): boolean {
	const reach = String(settings.Locallab?.[`Loc_${index}`] ?? '')
		.split(';')
		.filter(Boolean)
		.map(Number);
	return reach.length === 4 && reach.every((value) => value >= GRADIENT_REACH);
}

export function maskIndices(settings: PP3): number[] {
	return Object.keys(settings.Locallab ?? {})
		.flatMap((key) => (/^Name_\d+$/.test(key) ? [Number(key.slice(5))] : []))
		.sort((a, b) => a - b);
}

export function addLocalMask(settings: PP3, shape: 'ELI' | 'RECT'): number {
	settings.Locallab ??= { Enabled: false, Selspot: 0 };
	const indices = maskIndices(settings);
	const index = indices.length ? Math.max(...indices) + 1 : 0;
	const defaults = {
		Name: `Mask ${index + 1}`,
		Isvisible: true,
		Activ: true,
		Shape: shape,
		SpotMethod: 'norm',
		ShapeMethod: 'IND',
		QualityMethod: 'enh',
		ComplexMethod: 'mod',
		Loc: DEFAULT_LOC,
		CenterX: 0,
		CenterY: 0,
		Transit: 60,
		Feather: 25,
		Colorscope: 100,
		Deltae: false,
		Expcolor: true,
		Complexcolor: 0,
		Lightness: 0,
		Contrast: 0,
		Chroma: 0,
		Sensi: 100,
		Expexpose: true,
		Complexexpose: 0,
		Expcomp: 0,
		Sensiex: 100,
		...maskToolDefaults(),
		// The gradient stays at zero strength until the mask becomes a gradient
		...Object.fromEntries(gradientControls.map((control) => [control.key, control.key === 'Strcol' ? 0 : control.reset]))
	};
	for (const [key, value] of Object.entries(defaults)) settings.Locallab[`${key}_${index}`] = value;
	settings.Locallab.Enabled = true;
	settings.Locallab.Selspot = index;
	return index;
}

/** RT loads consecutive numbered spots; compact all fields, including unknown tools. */
export function deleteLocalMask(settings: PP3, index: number) {
	const remaining = maskIndices(settings).filter((value) => value !== index);
	const original = settings.Locallab;
	const next: PP3[string] = Object.fromEntries(Object.entries(original).filter(([key]) => !/_\d+$/.test(key)));
	for (const [destination, source] of remaining.entries()) {
		for (const [key, value] of Object.entries(original)) {
			if (key.endsWith(`_${source}`)) next[`${key.slice(0, key.lastIndexOf('_'))}_${destination}`] = value;
		}
	}
	next.Selspot = Math.max(0, Math.min(Number(original.Selspot), remaining.length - 1));
	if (!remaining.length) next.Enabled = false;
	settings.Locallab = next;
}

export function maskSize(settings: PP3, index: number, axis: 'width' | 'height') {
	const values = String(settings.Locallab[`Loc_${index}`]).split(';').filter(Boolean).map(Number);
	return (axis === 'width' ? values[0] + values[1] : values[2] + values[3]) / 20;
}

export function setMaskSize(settings: PP3, index: number, axis: 'width' | 'height', percent: number) {
	const values = String(settings.Locallab[`Loc_${index}`]).split(';').filter(Boolean).map(Number);
	const start = axis === 'width' ? 0 : 2;
	values[start] = values[start + 1] = Math.round(percent * 10);
	settings.Locallab[`Loc_${index}`] = `${values.join(';')};`;
}
