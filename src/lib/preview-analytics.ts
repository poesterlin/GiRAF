export type PreviewMetrics = Record<string, string | number | boolean>;

function previewContext(): PreviewMetrics {
	if (typeof window === 'undefined') return {};
	const hints = navigator as Navigator & { deviceMemory?: number; connection?: { type?: string; effectiveType?: string; saveData?: boolean; downlink?: number; rtt?: number } };
	return {
		viewportWidth: window.innerWidth,
		visibility: typeof document === 'undefined' ? 'unknown' : document.visibilityState,
		analyticsVersion: 2,
		pixelRatio: window.devicePixelRatio || 1,
		cores: hints.hardwareConcurrency || 0,
		memoryGb: hints.deviceMemory || 0,
		connection: hints.connection?.type || 'unknown',
		effectiveConnection: hints.connection?.effectiveType || 'unknown',
		saveData: hints.connection?.saveData || false,
		downlinkMbps: hints.connection?.downlink || 0,
		rttMs: hints.connection?.rtt || 0
	};
}

/** Local diagnostics only; no network requests or deferred event queue. */
export function trackPreview(name: string, data: PreviewMetrics) {
	if (typeof window === 'undefined') return;
	console.debug(`[preview] ${name}`, { ...previewContext(), ...data });
}

export function readServerTimings(header: string | null): PreviewMetrics {
	const timings: PreviewMetrics = {};
	for (const metric of (header ?? '').split(',')) {
		const match = metric.trim().match(/^([\w-]+);dur=([\d.]+)/);
		if (match && Number.isFinite(Number(match[2]))) timings[`server_${match[1]}Ms`] = Number(match[2]);
	}
	return timings;
}

/** An echoed ID proves these timings belong to this fetch, not a cached response. */
export function previewResponseMetrics(response: Response, requestId: string): PreviewMetrics {
	const serverRequestId = response.headers.get('X-Preview-Request');
	const fresh = serverRequestId === requestId;
	return {
		responseReuse: serverRequestId ? fresh ? 'fresh' : 'reused' : 'unknown',
		serverTimingsFresh: fresh,
		serverRequestId: serverRequestId || 'unknown',
		serverCache: fresh ? response.headers.get('X-Preview-Cache') || 'unknown' : 'not-current',
		sourceCache: fresh ? response.headers.get('X-Preview-Source-Cache') || 'unknown' : 'not-current',
		...(fresh ? readServerTimings(response.headers.get('Server-Timing')) : {})
	};
}

/** Two animation frames measure a paint opportunity, not proof of GPU presentation. */
export function trackPreviewPaint(requestId: string, stage: string, published: number, signal: AbortSignal) {
	if (typeof requestAnimationFrame === 'undefined' || typeof document === 'undefined' || document.hidden) return;
	requestAnimationFrame(() => {
		if (signal.aborted || document.hidden) return;
		requestAnimationFrame(() => {
			if (!signal.aborted && !document.hidden) trackPreview('preview-paint', { requestId, stage, publishToPaintOpportunityMs: Math.round(performance.now() - published) });
		});
	});
}
