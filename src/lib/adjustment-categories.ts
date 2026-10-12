export const adjustmentCategories = [
	{ id: 'whiteBalance', label: 'White Balance' },
	{ id: 'exposure', label: 'Light' },
	{ id: 'dynamicRange', label: 'Dynamic Range' },
	{ id: 'toneCurve', label: 'Tone Curve' },
	{ id: 'globalColor', label: 'Color' },
	{ id: 'colorMixer', label: 'Color Mixer' },
	{ id: 'colorGrading', label: 'Color Grading' },
	{ id: 'monochrome', label: 'Black & White' },
	{ id: 'clarity', label: 'Clarity' },
	{ id: 'noiseReduction', label: 'Noise Reduction' },
	{ id: 'detail', label: 'Sharpening' },
	{ id: 'vignette', label: 'Vignette' },
	{ id: 'look', label: 'Look' }
];

export function hiddenAdjustmentCategories(value: string): string[] {
	return value.split(',').filter(id => adjustmentCategories.some(category => category.id === id));
}
