export type PreviewDevice = 'mobile' | 'tablet' | 'desktop' | 'constrained';
export type PreviewStage = 'quick' | 'final';

export function previewDevice(hints: { width: number; memory?: number; cores?: number; saveData?: boolean; connection?: string; connectionType?: string }): PreviewDevice {
	if (
		hints.saveData ||
		hints.connectionType === 'cellular' ||
		(hints.memory !== undefined && hints.memory <= 2) ||
		(hints.cores !== undefined && hints.cores <= 2) ||
		['slow-2g', '2g', '3g'].includes(hints.connection ?? '')
	)
		return 'constrained';
	if (hints.width < 640) return 'mobile';
	if (hints.width < 1024) return 'tablet';
	return 'desktop';
}

/** Refinements render from a 2560px base in ~1.3s, so the wait before starting one can stay short. */
export function previewQuality(device: string | null, stage: PreviewStage) {
	const qualities: Record<PreviewDevice, number> = { constrained: 90, mobile: 92, tablet: 94, desktop: 95 };
	const sizes: Record<PreviewDevice, number> = { constrained: 1000, mobile: 2048, tablet: 2048, desktop: 2560 };
	const key = device && Object.hasOwn(qualities, device) ? (device as PreviewDevice) : 'desktop';
	return { size: stage === 'quick' ? 1000 : sizes[key], quality: stage === 'quick' ? 85 : qualities[key], settleDelay: key === 'constrained' ? 600 : key === 'mobile' ? 400 : 300 };
}
