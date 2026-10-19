/** How long the colour range stays on the photo after its slider last moved. */
const LINGER_MS = 1200;

/** While a mask's colour range slider moves, the masks page shows where the mask reaches. */
export const maskRangePreview = $state({ visible: false });

let timer: ReturnType<typeof setTimeout> | undefined;

export function showMaskRange() {
	maskRangePreview.visible = true;
	clearTimeout(timer);
	timer = setTimeout(() => (maskRangePreview.visible = false), LINGER_MS);
}
