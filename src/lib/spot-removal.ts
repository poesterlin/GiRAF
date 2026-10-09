import type { PP3 } from './pp3-utils';

/**
 * RawTherapee contract, verified against tags 5.12 (a8a3d1bc) and 5.13.
 * Source locations below refer to 5.12:
 * rtengine/procparams.cc:1971, 8416, 10730; rtengine/spot.cc:412;
 * rtengine/simpleprocess.cc:175, 834, 875.
 * https://github.com/RawTherapee/RawTherapee/blob/5.12/rtengine/procparams.cc
 *
 * Spots live in the input image AFTER coarse rotation/flips, BEFORE fine
 * rotation, lens/perspective transforms and crop. GiRAF stores them in preview
 * TIFF pixels (not RAW pixels or cropped JPEG pixels). Retouch overlays must
 * use that same unwarped, uncropped view. Feather extends the radius by
 * radius * feather; it does not shrink the solid centre. Entries are ordered.
 */
export type SpotPoint = { x: number; y: number };
export type SpotEntry = {
	source: SpotPoint;
	target: SpotPoint;
	radius: number;
	feather: number;
	opacity: number;
};
export type SpotRemovalSettings = { enabled: boolean; entries: SpotEntry[] };

export const SPOT_MIN_RADIUS = 1;
export const SPOT_MAX_RADIUS = 400;
export const SPOT_DEFAULT_RADIUS = 25;
export const SPOT_DEFAULT_FEATHER = 1;
export const SPOT_DEFAULT_OPACITY = 1;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Read only the contiguous Spot1..N sequence, just like RawTherapee's loader. */
export function readSpotRemoval(pp3: PP3): SpotRemovalSettings {
	const chapter = pp3.Spot_removal;
	const entries: SpotEntry[] = [];
	for (let i = 1; chapter && `Spot${i}` in chapter; i++) {
		const parts = String(chapter[`Spot${i}`]).split(';');
		if (parts.at(-1) === '') parts.pop();
		if (parts.length !== 7 || parts.some((part) => part.trim() === '')) continue;
		const values = parts.map(Number);
		if (!values.every(Number.isFinite)) continue;
		const [sx, sy, tx, ty, radius, feather, opacity] = values;
		entries.push({
			source: { x: Math.trunc(sx + 0.001), y: Math.trunc(sy + 0.001) },
			target: { x: Math.trunc(tx + 0.001), y: Math.trunc(ty + 0.001) },
			radius: clamp(Math.trunc(radius + 0.001), SPOT_MIN_RADIUS, SPOT_MAX_RADIUS),
			feather: clamp(feather, 0, 1),
			opacity: clamp(opacity, 0, 1)
		});
	}
	return { enabled: chapter?.Enabled === true, entries };
}

/** Return a new PP3; replace the entire entry sequence so removed spots stay removed. */
export function writeSpotRemoval(pp3: PP3, settings: SpotRemovalSettings): PP3 {
	const chapter = { ...pp3.Spot_removal, Enabled: settings.enabled };
	for (const key of Object.keys(chapter)) {
		if (/^Spot\d+$/.test(key)) delete (chapter as PP3[string])[key];
	}
	settings.entries.forEach((entry, index) => {
		const values = [entry.source.x, entry.source.y, entry.target.x, entry.target.y, entry.radius, entry.feather, entry.opacity];
		if (!values.every(Number.isFinite)) throw new RangeError('Spot values must be finite');
		const serialized = [
			...values.slice(0, 4).map(Math.round),
			clamp(Math.round(entry.radius), SPOT_MIN_RADIUS, SPOT_MAX_RADIUS),
			clamp(entry.feather, 0, 1),
			clamp(entry.opacity, 0, 1)
		];
		(chapter as PP3[string])[`Spot${index + 1}`] = `${serialized.join(';')};`;
	});
	return { ...pp3, Spot_removal: chapter };
}

/**
 * Map between uncropped TIFF input sizes. Quarter-turns swap the scale axes;
 * flips do not. A circular radius uses the smaller scale (integer resize can
 * produce slightly different axes). RT itself caps the resulting radius at 400.
 * Neither crop offsets nor fine-rotation coordinates belong in this mapping.
 */
export function mapSpotRemovalToTarget(pp3: PP3, sourceWidth: number, sourceHeight: number, targetWidth: number, targetHeight: number): PP3 {
	if (!pp3.Spot_removal || ![sourceWidth, sourceHeight, targetWidth, targetHeight].every((n) => Number.isFinite(n) && n > 0)) return pp3;
	if (sourceWidth === targetWidth && sourceHeight === targetHeight) return pp3;
	const quarterTurn = Math.abs(Number(pp3.Coarse_Transformation?.Rotate ?? 0)) % 180 === 90;
	const scaleX = quarterTurn ? targetHeight / sourceHeight : targetWidth / sourceWidth;
	const scaleY = quarterTurn ? targetWidth / sourceWidth : targetHeight / sourceHeight;
	const settings = readSpotRemoval(pp3);
	const point = ({ x, y }: SpotPoint): SpotPoint => ({ x: x * scaleX, y: y * scaleY });
	return writeSpotRemoval(pp3, {
		...settings,
		entries: settings.entries.map((entry) => ({
			...entry,
			source: point(entry.source),
			target: point(entry.target),
			radius: entry.radius * Math.min(scaleX, scaleY)
		}))
	});
}
