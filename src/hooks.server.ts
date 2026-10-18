import type { ServerInit } from '@sveltejs/kit';
import { sweepTemporaryFiles } from '$lib/server/tmp-sweep';

export const init: ServerInit = () => {
	// Runs in the background so a large leftover pile never delays the first request
	void sweepTemporaryFiles().catch((cause) => console.error('[tmp-sweep] Failed:', cause));
};
