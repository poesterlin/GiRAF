import { randomId } from '$lib';
import { previewDevice, previewQuality, type PreviewDevice } from './editor-preview-policy';
import { previewResponseMetrics, trackPreview, trackPreviewPaint, type PreviewMetrics } from './preview-analytics';

let clientId: string | undefined;

async function findCachedPreview(endpoint: string, options: RequestInit, signal: AbortSignal) {
	const probes = [
		{ source: 'browser', url: endpoint, options: { ...options, mode: 'same-origin' as const, cache: 'only-if-cached' as const } },
		{ source: 'server', url: `${endpoint}&cacheOnly=1`, options: { ...options, cache: 'no-store' as const } }
	];
	for (const probe of probes) {
		try {
			const response = await fetch(probe.url, probe.options);
			if (response.status === 200) return { response, source: probe.source };
		} catch {
			// Unsupported browser probes and network failures can recover normally.
			signal.throwIfAborted();
		}
	}
	return { response: undefined, source: 'miss' };
}

function waitForSettling(delay: number, signal: AbortSignal): Promise<void> {
	signal.throwIfAborted();
	return new Promise((resolve, reject) => {
		const abort = () => {
			clearTimeout(timer);
			signal.removeEventListener('abort', abort);
			reject(signal.reason);
		};
		const timer = setTimeout(
			() => {
				signal.removeEventListener('abort', abort);
				resolve();
			},
			Math.max(0, delay)
		);
		signal.addEventListener('abort', abort, { once: true });
	});
}

function previewFailure(signal: AbortSignal, status: PreviewMetrics[string], phase: string) {
	if (signal.aborted) {
		const reason = signal.reason;
		const knownReason = typeof reason === 'string' && ['edit-or-navigation', 'superseded'].includes(reason);
		return { failureReason: 'aborted', abortReason: knownReason ? reason : 'abort-signal', outcome: 'cancelled' };
	}
	let failureReason = `${phase}-error`;
	if (Number(status) >= 400) failureReason = 'http-error';
	else if (phase === 'fetch') failureReason = 'network-error';
	return { failureReason, abortReason: 'none', outcome: 'error' };
}

export function getPreviewDevice(): PreviewDevice {
	const hints = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean; effectiveType?: string; type?: string } };
	return previewDevice({
		width: window.innerWidth,
		memory: hints.deviceMemory,
		cores: hints.hardwareConcurrency,
		saveData: hints.connection?.saveData,
		connection: hints.connection?.effectiveType,
		connectionType: hints.connection?.type
	});
}

/**
 * Only transports server-rendered JPEGs. Decode before publishing to avoid flashes.
 * `quickDone` runs once the quick stage has finished, before any refinement starts.
 */
export async function loadEditorPreview(imageId: string, config: string, device: PreviewDevice, signal: AbortSignal, publish: (url: string) => void, quickDone?: () => void) {
	clientId ??= randomId();
	const requestId = randomId();
	const started = performance.now();
	let ready = false;
	for (const stage of ['quick', 'final'] as const) {
		if (stage === 'final') {
			quickDone?.();
			signal.throwIfAborted();
		}
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
				const cached = await findCachedPreview(endpoint, options, signal);
				response = cached.response;
				metrics.refinementCache = cached.source;
				metrics.cacheLookupMs = Math.round(performance.now() - fetchStarted);
				metrics.settleSkipped = !!response;
			}
			nextPhase('settling');
			if (stage === 'final' && !response) {
				await waitForSettling(previewQuality(device, 'final').settleDelay - (performance.now() - stageStarted), signal);
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
				trackPreview('preview-render', {
					...metrics,
					outcome: 'displayed',
					stageMs: Math.round(performance.now() - stageStarted),
					totalMs: Math.round(performance.now() - started)
				});
			} catch (error) {
				URL.revokeObjectURL(url);
				throw error;
			}
		} catch (error) {
			const failedPhase = phase;
			nextPhase('finished');
			trackPreview('preview-render', {
				...metrics,
				...previewFailure(signal, metrics.httpStatus, failedPhase),
				phase: failedPhase,
				retainedPreview: ready,
				stageMs: Math.round(performance.now() - stageStarted),
				totalMs: Math.round(performance.now() - started)
			});
			if (signal.aborted) throw error;
			// A failed quick pass can still recover at final quality. Keep a successful
			// quick pass if refinement fails rather than replacing it with an error.
			if (stage === 'final' && !ready) throw error;
		}
	}
}

/**
 * Runs one editor preview at a time. While a quick render is in flight, newer edits wait and only the
 * newest runs once it lands, so dragging a slider keeps showing updates instead of cancelling every
 * render before it finishes. A pending refinement is cheap to drop, so edits replace it immediately.
 */
export class EditorPreviewQueue {
	private current: { imageId: string; controller: AbortController; quickDone: boolean } | null = null;
	private waiting: (() => void) | null = null;

	/**
	 * @param publish receives each decoded preview and its image; `latest` is false while a newer edit still waits.
	 * @param finished runs when the newest request has finished, with the error if it failed.
	 */
	constructor(
		private publish: (url: string, imageId: string, latest: boolean) => void,
		private finished: (error?: unknown) => void
	) {}

	request(imageId: string, config: string, device: PreviewDevice) {
		const start = () => this.start(imageId, config, device);
		if (this.current && !this.current.quickDone && this.current.imageId === imageId) {
			this.waiting = start;
			return;
		}
		this.waiting = null;
		this.current?.controller.abort('superseded');
		start();
	}

	cancel(reason = 'edit-or-navigation') {
		this.waiting = null;
		this.current?.controller.abort(reason);
		this.current = null;
	}

	private start(imageId: string, config: string, device: PreviewDevice) {
		const run = { imageId, controller: new AbortController(), quickDone: false };
		this.current = run;
		const { signal } = run.controller;
		const done = () => {
			run.quickDone = true;
			const next = this.waiting;
			this.waiting = null;
			if (!next) return;
			run.controller.abort('superseded');
			next();
		};
		loadEditorPreview(imageId, config, device, signal, (url) => this.publish(url, imageId, !this.waiting), done)
			.then(() => {
				if (this.current === run) this.finished();
			})
			.catch((error) => {
				if (!signal.aborted && this.current === run) this.finished(error);
			});
	}
}
