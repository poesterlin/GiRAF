// RawTherapee's RAW white point is a linear pre-exposure multiplier (1 = camera white).
// The slider works in stops so each step feels the same across the range.
export const WHITE_POINT_MIN_STOPS = -2;
export const WHITE_POINT_MAX_STOPS = 2;

export function whitePointToPP3(stops: number): number {
	return Number((2 ** stops).toFixed(3));
}

export function whitePointFromPP3(multiplier: number): number {
	return multiplier > 0 ? Math.log2(multiplier) : 0;
}
