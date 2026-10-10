export type PreviewDevice = 'mobile' | 'tablet' | 'desktop' | 'constrained';
export type PreviewStage = 'quick' | 'final';

export function previewDevice(hints: { width: number; memory?: number; cores?: number; saveData?: boolean; connection?: string }): PreviewDevice {
	if (hints.saveData || (hints.memory !== undefined && hints.memory <= 2) || (hints.cores !== undefined && hints.cores <= 2) || ['slow-2g', '2g'].includes(hints.connection ?? '')) return 'constrained';
	if (hints.width < 640) return 'mobile';
	if (hints.width < 1024) return 'tablet';
	return 'desktop';
}

export function previewQuality(device: string | null, stage: PreviewStage) {
	const qualities: Record<PreviewDevice, number> = { constrained: 90, mobile: 92, tablet: 94, desktop: 95 };
	const sizes: Record<PreviewDevice, number> = { constrained: 1000, mobile: 1600, tablet: 2048, desktop: 2560 };
	const key = device && Object.hasOwn(qualities, device) ? device as PreviewDevice : 'desktop';
	return { size: stage === 'quick' ? 1000 : sizes[key], quality: stage === 'quick' ? 85 : qualities[key], settleDelay: key === 'constrained' ? 1200 : key === 'mobile' ? 800 : 600 };
}
