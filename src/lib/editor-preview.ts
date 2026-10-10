import { previewDevice, previewQuality, type PreviewDevice } from './editor-preview-policy';

let clientId: string | undefined;

export function getPreviewDevice(): PreviewDevice {
	const hints = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean; effectiveType?: string } };
	return previewDevice({ width: window.innerWidth, memory: hints.deviceMemory, cores: hints.hardwareConcurrency, saveData: hints.connection?.saveData, connection: hints.connection?.effectiveType });
}

/** Only transports server-rendered JPEGs. Decode before publishing to avoid flashes. */
export async function loadEditorPreview(imageId: string, config: string, device: PreviewDevice, signal: AbortSignal, publish: (url: string) => void) {
	clientId ??= crypto.randomUUID();
	let ready = false;
	for (const stage of ['quick', 'final'] as const) {
		try {
			if (stage === 'final') {
				await new Promise<void>((resolve, reject) => {
					const abort = () => { clearTimeout(timer); reject(signal.reason); };
					const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, previewQuality(device, 'final').settleDelay);
					signal.addEventListener('abort', abort, { once: true });
					if (signal.aborted) abort();
				});
			}
			signal.throwIfAborted();
			const response = await fetch(`/api/images/${imageId}/edit?config=${encodeURIComponent(config)}&stage=${stage}&device=${device}`, { signal, headers: { 'X-Preview-Client': clientId } });
			if (!response.ok) throw new Error(`Preview failed: ${response.status}`);
			const url = URL.createObjectURL(await response.blob());
			try {
				const image = new Image();
				image.src = url;
				await image.decode();
				signal.throwIfAborted();
				publish(url);
				ready = true;
			} catch (error) {
				URL.revokeObjectURL(url);
				throw error;
			}
		} catch (error) {
			if (signal.aborted) throw error;
			// A failed quick pass can still recover at final quality. Keep a successful
			// quick pass if refinement fails rather than replacing it with an error.
			if (stage === 'final' && !ready) throw error;
		}
	}
}
