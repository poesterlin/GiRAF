import { wrap, type Remote } from 'comlink';
import PreviewWorker from './local-preview.worker?worker';
import type { LocalPreviewWorker } from './local-preview.worker';
import { extractLocalPhotoPreview } from './local-photo-preview';
import { fingerprintFile } from './upload-duplicates';
import { importTiming } from './import-timing';

type WorkerState = {
	worker: Worker;
	api: Remote<LocalPreviewWorker>;
	pending: Set<(error: Error) => void>;
	dispose: () => void;
};

let state: WorkerState | undefined;
let fingerprintState: WorkerState | undefined;
let unavailable = false;

function stopWorker(current: WorkerState, error: Error) {
	if (state === current) state = undefined;
	if (fingerprintState === current) fingerprintState = undefined;
	current.dispose();
	current.worker.terminate();
	for (const reject of current.pending) reject(error);
	current.pending.clear();
}

function getWorker(fingerprint = false): WorkerState | undefined {
	const existing = fingerprint ? fingerprintState : state;
	if (existing) return existing;
	if (unavailable || typeof Worker === 'undefined') return;
	try {
		const options: WorkerOptions = { type: 'module' };
		const worker = new PreviewWorker(options);
		const failed = () => {
			unavailable = true;
			stopWorker(current, new Error('Local preview worker failed.'));
		};
		const current: WorkerState = {
			worker,
			api: wrap<LocalPreviewWorker>(worker),
			pending: new Set(),
			dispose: () => {
				worker.removeEventListener('error', failed);
				worker.removeEventListener('messageerror', failed);
			}
		};
		worker.addEventListener('error', failed);
		worker.addEventListener('messageerror', failed);
		if (fingerprint) fingerprintState = current;
		else state = current;
		return current;
	} catch {
		unavailable = true;
	}
}

async function request<T>(current: WorkerState, call: () => Promise<T>, timeout = 5000): Promise<T> {
	let rejectPending!: (error: Error) => void;
	let timer: ReturnType<typeof setTimeout> | undefined;
	const failure = new Promise<never>((_, reject) => {
		rejectPending = reject;
		current.pending.add(reject);
		timer = setTimeout(() => {
			unavailable = true;
			stopWorker(current, new Error('Local preview worker timed out.'));
		}, timeout);
	});
	try {
		return await Promise.race([call(), failure]);
	} finally {
		clearTimeout(timer);
		current.pending.delete(rejectPending);
	}
}

/** The caller owns the returned URL and must revoke it when no longer needed. */
export async function getLocalPreview(file: File): Promise<{ url: string; capturedAt?: Date }> {
	const started = performance.now();
	const current = getWorker();
	if (current) {
		try {
			const { blob, capturedAt, timing } = await request(current, () => current.api.getPreview(file));
			importTiming('preview.worker', started, { file: file.name, bytes: blob.size, ...timing });
			return { url: URL.createObjectURL(blob), capturedAt };
		} catch (error) {
			importTiming('preview.fallback', started, { file: file.name, error: String(error) });
			// Unsupported worker image APIs and worker failures use bounded extraction directly.
		}
	}
	const preview = await extractLocalPhotoPreview(file, { preferThumbnail: true });
	importTiming('preview.direct', started, { file: file.name });
	return preview;
}

export async function getLocalFingerprint(file: File): Promise<string> {
	const started = performance.now();
	const current = getWorker(true);
	if (current) {
		try {
			return await request(current, () => current.api.getFingerprint(file), 30000);
		} catch (error) {
			importTiming('hash.fallback', started, { file: file.name, error: String(error) });
			// Keep duplicate detection available when workers are unavailable.
		}
	}
	return fingerprintFile(file);
}

/** Terminate pending work. Returned URLs remain caller-owned; a later call may start a fresh worker. */
export function releaseLocalPreviewWorker(): void {
	if (state) stopWorker(state, new Error('Local preview worker released.'));
	unavailable = false;
}
