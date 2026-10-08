export type UploadSessionTarget = { name?: string; sessionId?: number };

/** Capture the target now, then assign each file as its existing transfer finishes. */
export function assignPendingUploads(uploads: Promise<number | undefined>[], target: UploadSessionTarget, onAssigned: (index: number) => void, onError: (error: unknown) => void) {
	const assign = createUploadAssignment({ ...target }, () => {});
	return Promise.all(
		uploads.map(async (upload, index) => {
			try {
				const id = await upload;
				if (id === undefined) return;
				await assign([id]);
				onAssigned(index);
			} catch (error) {
				onError(error);
			}
		})
	);
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
