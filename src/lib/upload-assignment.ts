export type UploadSessionTarget = { name?: string; sessionId?: number };

/** The server assigns a batch in one transaction, so this bounds how long one request holds it. */
export const ASSIGNMENT_BATCH_SIZE = 50;

/**
 * Capture the target now, then assign files in batches: everything already on the server goes
 * together, and files still transferring join the next batch as they finish.
 */
export async function assignPendingUploads(
	uploads: Promise<number | undefined>[],
	target: UploadSessionTarget,
	onAssigned: (indices: number[]) => void,
	onError: (error: unknown) => void
) {
	const assign = createUploadAssignment({ ...target }, () => {});
	const waiting: { id: number; index: number }[] = [];
	let draining: Promise<void> | undefined;

	async function send(batch: { id: number; index: number }[]) {
		try {
			await assign(batch.map(({ id }) => id));
			onAssigned(batch.map(({ index }) => index));
		} catch (error) {
			if (batch.length === 1) return onError(error);
			// The server rejects a whole batch for one missing file; retry singly so the rest still land.
			const reported = new Set<string>();
			for (const entry of batch) {
				try {
					await assign([entry.id]);
					onAssigned([entry.index]);
				} catch (single) {
					const message = single instanceof Error ? single.message : String(single);
					if (!reported.has(message)) onError(single);
					reported.add(message);
				}
			}
		}
	}
	async function drain() {
		while (waiting.length) await send(waiting.splice(0, ASSIGNMENT_BATCH_SIZE));
		draining = undefined;
	}
	function queue(entry: { id: number; index: number }) {
		waiting.push(entry);
		// Start after the current microtasks so files that resolve together share one request.
		draining ??= Promise.resolve().then(drain);
	}

	await Promise.all(
		uploads.map(async (upload, index) => {
			try {
				const id = await upload;
				if (id !== undefined) queue({ id, index });
			} catch (error) {
				onError(error);
			}
		})
	);
	while (draining) await draining;
}

/** Serialize assignment (not transfer) so a new session is created only once. */
export function createUploadAssignment(target: UploadSessionTarget, onSession: (id: number) => void) {
	let sessionId = target.sessionId;
	let tail: Promise<void> = Promise.resolve();
	return (importIds: number[]) => {
		const assignment = tail.then(async () => {
			const response = await fetch('/api/imports', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ ...(sessionId ? { sessionId } : target), importIds, enqueue: true })
			});
			const payload = await response.json();
			if ((response.ok || payload.assignmentCommitted) && Number.isSafeInteger(payload.sessionId)) {
				sessionId = payload.sessionId;
				onSession(sessionId!);
			}
			if (!response.ok) throw new Error(payload.message || `Session assignment failed (${response.status})`);
		});
		// A failed file must not prevent subsequent files from being assigned.
		tail = assignment.catch(() => {});
		return assignment;
	};
}
