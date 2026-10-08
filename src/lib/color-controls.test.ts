import { expect, test } from 'bun:test';
import { gradeToRgb, rgbToGrade } from './color-controls';

test('zero grading amount is neutral for any hue', () => {
	for (const hue of [0, 40, 120, 220, 359]) {
		for (const channel of gradeToRgb(hue, 0)) expect(Math.abs(channel)).toBe(0);
	}
});

test('grading hue and amount survive RGB storage without shifting the neutral sum', () => {
	for (const hue of [0, 40, 120, 220, 359]) {
		const channels = gradeToRgb(hue, 25);
		expect(channels.reduce((sum, channel) => sum + channel, 0)).toBeCloseTo(0);
		expect(rgbToGrade(channels, 0)).toEqual({ hue, amount: 25 });
	}
});

test('neutral primary controls produce identity channel mixer columns', () => {
	for (let primary = 0; primary < 3; primary++) {
		const column = gradeToRgb(primary * 120, 1000).map((value) => Math.round(value + 1000 / 3));
		expect(column).toEqual([0, 1, 2].map((index) => index === primary ? 1000 : 0));
	}
});
