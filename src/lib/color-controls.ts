export const primaryDefaults = [
	{ name: 'Red' },
	{ name: 'Green' },
	{ name: 'Blue' }
];

export function gradeToRgb(hue: number, amount: number) {
	const h = ((hue % 360) + 360) % 360 / 60;
	const x = 1 - Math.abs(h % 2 - 1);
	const channels = h < 1 ? [1, x, 0] : h < 2 ? [x, 1, 0] : h < 3 ? [0, 1, x] : h < 4 ? [0, x, 1] : h < 5 ? [x, 0, 1] : [1, 0, x];
	const mean = channels.reduce((sum, channel) => sum + channel, 0) / 3;
	return channels.map((channel) => (channel - mean) * amount);
}

export function rgbToGrade(channels: number[], defaultHue: number) {
	const max = Math.max(...channels), min = Math.min(...channels), delta = max - min;
	if (delta < 0.001) return { hue: defaultHue, amount: 0 };
	const [r, g, b] = channels;
	const h = max === r ? (g - b) / delta : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
	return { hue: Math.round((h * 60 + 360) % 360), amount: Math.round(delta) };
}
