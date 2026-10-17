import { expect, test } from 'bun:test';
import { sameProfile } from './redevelop';

test('profiles compare by settings, not formatting', () => {
	const a = '[Exposure]\nAuto=true\nEnabled=true\n\n[Resize]\nWidth=1000';
	const b = '# note\n[Exposure]\nEnabled=true\nAuto=true\n[Resize]\nWidth=1000\n';
	expect(sameProfile(a, b)).toBe(true);
	expect(sameProfile(a, `${a}\n[LensProfile]\nLcMode=lfauto\n`)).toBe(false);
});
