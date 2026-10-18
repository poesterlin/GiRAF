import type { PP3 } from './pp3-utils';

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
		Loc: '500;500;500;500;',
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
		Sensiex: 100
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
