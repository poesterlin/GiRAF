import { maskIndices } from '$lib/local-masks';
import { parsePP3, stringifyPP3, type PP3 } from '$lib/pp3-utils';
import { readSpotRemoval } from '$lib/spot-removal';

/**
 * True when an edit places something at pixel positions on the developed image: a crop, spot
 * removals or local masks. Re-developing such a photo with a different import profile (for example
 * adding lens distortion correction) would move the image under them.
 */
export function hasPositionalEdits(pp3: PP3): boolean {
	if (pp3.Crop && pp3.Crop.Enabled !== false) return true;
	if (readSpotRemoval(pp3).entries.length > 0) return true;
	return pp3.Locallab?.Enabled === true && maskIndices(pp3).length > 0;
}

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
