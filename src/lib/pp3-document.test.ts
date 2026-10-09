import { expect, test } from 'bun:test';
import { parsePP3Document, stringifyPP3Document, type PP3Document } from './pp3-document';
import { parsePP3 } from './pp3-utils';

const document: PP3Document = {
	settings: { Local_Contrast: { Enabled: false, Amount: 0.3 }, Dehaze: { Enabled: false, Strength: 20 } },
	comments: ['# Photo settings'],
	ui: {
		disabledGroups: ['clarity'],
		savedValues: { Local_Contrast: { Enabled: true, Amount: 0.3 }, Dehaze: { Enabled: true, Strength: 20 } }
	}
};

test('disabled groups and remembered tool values round-trip without altering effective settings', () => {
	const serialized = stringifyPP3Document(document);
	expect(parsePP3Document(serialized)).toEqual(document);
	expect(parsePP3(serialized)).toEqual(document.settings);
	expect(serialized).toContain('# GiRAF-UI-Version: 1');
	expect(serialized).not.toContain('[GiRAF');
});

test('plain PP3 and ordinary comments work without UI metadata', () => {
	const parsed = parsePP3Document('# Existing comment\n[Exposure]\nCompensation=0.25\n# Inside section');
	expect(parsed.ui).toBeUndefined();
	expect(parsed.comments).toEqual(['# Existing comment', '# Inside section']);
	expect(parsePP3Document(stringifyPP3Document(parsed))).toEqual(parsed);
	expect(stringifyPP3Document({ settings: {}, comments: [] })).toBe('');
});

test('metadata supports Unicode, delimiters, curve lists and exact remembered values', () => {
	const copy = structuredClone(document);
	copy.ui!.disabledGroups = ['色彩 🎨'];
	copy.ui!.savedValues = { Color_Management: { Redx: 0.734712345, InputProfile: 'été=日本.icc' }, HSV_Equalizer: { HCurve: '1;0;0.5;0.35;0.35;' } };
	expect(parsePP3Document(stringifyPP3Document(copy))).toEqual(copy);
});

test('CRLF, BOM, indentation and metadata after settings are supported', () => {
	const source = '\uFEFF[Dehaze]\r\nEnabled=false\r\n  # GiRAF-UI: {"disabledGroups":[],"savedValues":{}}\r\n # GiRAF-UI-Version: 1';
	expect(parsePP3Document(source).ui).toEqual({ disabledGroups: [], savedValues: {} });
});

test('invalid, incomplete, duplicate and unsupported metadata fail explicitly', () => {
	const cases = [
		'# GiRAF-UI-Version: 2\n# GiRAF-UI: {}',
		'# GiRAF-UI-Version: 1',
		'# GiRAF-UI: {}',
		'# GiRAF-UI-Version: 1\n# GiRAF-UI: broken',
		'# GiRAF-UI-Version: 1\n# GiRAF-UI: null',
		'# GiRAF-UI-Version: 1\n# GiRAF-UI: {"disabledGroups":["clarity","clarity"],"savedValues":{}}',
		'# GiRAF-UI-Version: 1\n# GiRAF-UI: {"disabledGroups":[],"savedValues":{"Exposure":{"Black":null}}}',
		'# GiRAF-UI-Version: 1\n# GiRAF-UI-Version: 1\n# GiRAF-UI: {}',
		'# GiRAF-UI-Version: 1\n# GiRAF-UI: {}\n# GiRAF-UI: {}'
	];
	for (const source of cases) expect(() => parsePP3Document(source)).toThrow();
});

test('serializer rejects invalid metadata and comment injection', () => {
	const copy = structuredClone(document);
	copy.ui!.savedValues.Exposure = { Black: NaN };
	expect(() => stringifyPP3Document(copy)).toThrow('Invalid GiRAF saved settings');
	for (const comment of ['[Exposure]', '# comment\nEnabled=true', '# GiRAF-UI: {}']) {
		expect(() => stringifyPP3Document({ settings: {}, comments: [comment] })).toThrow();
	}
});

test('repeated saves produce one metadata header and do not mutate input', () => {
	const original = structuredClone(document);
	let serialized = stringifyPP3Document(document);
	for (let i = 0; i < 3; i++) serialized = stringifyPP3Document(parsePP3Document(serialized));
	expect(serialized.match(/# GiRAF-UI-Version:/g)).toHaveLength(1);
	expect(serialized.match(/# GiRAF-UI:/g)).toHaveLength(1);
	expect(document).toEqual(original);
});
