import { previewDevice, previewQuality, type PreviewDevice } from './editor-preview-policy';
import { previewResponseMetrics, trackPreview, trackPreviewPaint, type PreviewMetrics } from './preview-analytics';

let clientId: string | undefined;

export function getPreviewDevice(): PreviewDevice {
	const hints = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean; effectiveType?: string; type?: string } };
	return previewDevice({ width: window.innerWidth, memory: hints.deviceMemory, cores: hints.hardwareConcurrency, saveData: hints.connection?.saveData, connection: hints.connection?.effectiveType, connectionType: hints.connection?.type });
}

/** Only transports server-rendered JPEGs. Decode before publishing to avoid flashes. */
export async function loadEditorPreview(imageId: string, config: string, device: PreviewDevice, signal: AbortSignal, publish: (url: string) => void) {
	clientId ??= crypto.randomUUID();
	const requestId = crypto.randomUUID();
	const started = performance.now();
	let ready = false;
	for (const stage of ['quick', 'final'] as const) {
		// Do not spend a second download or RAW render on constrained connections.
		if (stage === 'final' && device === 'constrained' && ready) {
			trackPreview('preview-refinement-skipped', { requestId, device, engine: 'server', reason: 'constrained-device-or-connection' });
			return;
		}
		const stageStarted = performance.now();
		const metrics: PreviewMetrics = { requestId, device, stage, engine: 'server', routing: 'server-only-editor', quality: previewQuality(device, stage).quality };
		let phase = 'cacheLookup';
		let phaseStarted = performance.now();
		const nextPhase = (next: string) => {
			metrics[`${phase}Ms`] = Math.round(performance.now() - phaseStarted);
			phase = next;
			phaseStarted = performance.now();
		};
		try {
			const endpoint = `/api/images/${imageId}/edit?config=${encodeURIComponent(config)}&stage=${stage}&device=${device}`;
			const options = { signal, headers: { 'X-Preview-Client': clientId, 'X-Preview-Request': requestId } };
			let response: Response | undefined;
			let fetchStarted = performance.now();
			if (stage === 'final') {
				// This fetch is browser-cache-only: a miss cannot trigger network/render work.
				try {
					const cached = await fetch(endpoint, { ...options, mode: 'same-origin', cache: 'only-if-cached' });
					if (cached.status === 200) { response = cached; metrics.refinementCache = 'browser'; }
				} catch { signal.throwIfAborted(); /* Some browsers do not support cache-only fetches. */ }
				if (!response) {
					try {
						const cached = await fetch(`${endpoint}&cacheOnly=1`, { ...options, cache: 'no-store' });
						if (cached.status === 200) { response = cached; metrics.refinementCache = 'server'; }
					} catch { signal.throwIfAborted(); /* A failed probe can recover through the normal request. */ }
				}
				metrics.cacheLookupMs = Math.round(performance.now() - fetchStarted);
				metrics.refinementCache ??= 'miss';
				metrics.settleSkipped = !!response;
			}
			nextPhase('settling');
			if (stage === 'final' && !response) {
				await new Promise<void>((resolve, reject) => {
					const abort = () => { clearTimeout(timer); reject(signal.reason); };
					const remainingDelay = Math.max(0, previewQuality(device, 'final').settleDelay - (performance.now() - stageStarted));
					const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, remainingDelay);
					signal.addEventListener('abort', abort, { once: true });
					if (signal.aborted) abort();
				});
			}
			signal.throwIfAborted();
			nextPhase('fetch');
			if (!response) {
				fetchStarted = performance.now();
				response = await fetch(endpoint, options);
			}
			metrics.ttfbMs = Math.round(performance.now() - fetchStarted);
			metrics.httpStatus = response.status;
			Object.assign(metrics, previewResponseMetrics(response, requestId));
			if (!response.ok) throw new Error(`Preview failed: ${response.status}`);
			nextPhase('download');
			const downloadStarted = performance.now();
			const blob = await response.blob();
			metrics.downloadMs = Math.round(performance.now() - downloadStarted);
			metrics.bytes = blob.size;
			const url = URL.createObjectURL(blob);
			try {
				const image = new Image();
				image.src = url;
				nextPhase('decode');
				const decodeStarted = performance.now();
				await image.decode();
				metrics.decodeMs = Math.round(performance.now() - decodeStarted);
				metrics.width = image.naturalWidth || 0;
				metrics.height = image.naturalHeight || 0;
				signal.throwIfAborted();
				nextPhase('publish');
				publish(url);
				ready = true;
				trackPreviewPaint(requestId, stage, performance.now(), signal);
				trackPreview('preview-render', { ...metrics, outcome: 'displayed', stageMs: Math.round(performance.now() - stageStarted), totalMs: Math.round(performance.now() - started) });
			} catch (error) {
				URL.revokeObjectURL(url);
				throw error;
			}
		} catch (error) {
			const failedPhase = phase;
			nextPhase('finished');
			trackPreview('preview-render', { ...metrics, phase: failedPhase, failureReason: signal.aborted ? 'aborted' : Number(metrics.httpStatus) >= 400 ? 'http-error' : failedPhase === 'fetch' ? 'network-error' : `${failedPhase}-error`, abortReason: signal.aborted ? typeof signal.reason === 'string' && ['edit-or-navigation', 'superseded'].includes(signal.reason) ? signal.reason : 'abort-signal' : 'none', outcome: signal.aborted ? 'cancelled' : 'error', retainedPreview: ready, stageMs: Math.round(performance.now() - stageStarted), totalMs: Math.round(performance.now() - started) });
			if (signal.aborted) throw error;
			// A failed quick pass can still recover at final quality. Keep a successful
			// quick pass if refinement fails rather than replacing it with an error.
			if (stage === 'final' && !ready) throw error;
		}
	}
}
