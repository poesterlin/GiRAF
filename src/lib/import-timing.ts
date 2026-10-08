type Detail = Record<string, string | number | boolean | undefined>;
const entries: Detail[] = [];

/** Bounded, session-local diagnostics; available as window.__importTimings. */
export function importTiming(stage: string, started: number, detail: Detail = {}) {
	const entry = { stage, ms: Math.round(performance.now() - started), at: Math.round(performance.now()), ...detail };
	entries.push(entry);
	if (entries.length > 3000) entries.shift();
	if (typeof window !== 'undefined') Object.assign(window, { __importTimings: entries });
	console.info('[import-timing]', entry);
}
