import { parsePP3, stringifyPP3, type PP3 } from '$lib/pp3-utils';

/** Compares import profiles by their settings, ignoring comments, blank lines and key order. */
export function sameProfile(a: string, b: string): boolean {
	const normalize = (pp3: string) => {
		const parsed = parsePP3(pp3);
		const sorted: PP3 = {};
		for (const chapter of Object.keys(parsed).sort()) {
			sorted[chapter] = Object.fromEntries(Object.entries(parsed[chapter]).sort(([x], [y]) => x.localeCompare(y)));
		}
		return stringifyPP3(sorted);
	};
	return normalize(a) === normalize(b);
}
