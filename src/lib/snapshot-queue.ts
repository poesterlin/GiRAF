export type SavedSnapshot = { id: number; createdAt: string | Date };

/** Serializes snapshot writes; a failed write never blocks subsequent saves. */
export class SnapshotQueue {
	private tail: Promise<void> = Promise.resolve();
	private pending = new Map<string, number>();

	hasPending(imageId: string) {
		return this.pending.has(imageId);
	}

	/**
	 * Writes a version for the image. With a snapshotId the latest snapshot is
	 * rewritten in place; the server refuses when that snapshot is no longer the
	 * newest one, and the save falls back to creating a version instead.
	 */
	save(imageId: string, pp3: string, snapshotId?: number): Promise<SavedSnapshot> {
		this.pending.set(imageId, (this.pending.get(imageId) ?? 0) + 1);
		const task = this.tail
			.catch(() => {})
			.then(async () => {
				try {
					const updated = snapshotId ? await this.request(imageId, pp3, snapshotId, 'PATCH') : undefined;
					// A refused in-place update falls back to a version of its own.
					const saved = updated ?? (await this.request(imageId, pp3, undefined, 'POST'));
					if (!saved) throw new Error('Failed to save snapshot');
					return saved;
				} finally {
					const remaining = (this.pending.get(imageId) ?? 1) - 1;
					if (remaining) this.pending.set(imageId, remaining);
					else this.pending.delete(imageId);
				}
			});
		this.tail = task.then(
			() => {},
			() => {}
		);
		return task;
	}

	private async request(imageId: string, pp3: string, snapshotId: number | undefined, method: 'POST' | 'PATCH'): Promise<SavedSnapshot | undefined> {
		const response = await fetch(`/api/images/${imageId}/snapshots`, {
			method,
			headers: { 'Content-Type': 'application/json' },
			keepalive: true,
			body: JSON.stringify(snapshotId ? { pp3, snapshotId } : { pp3 })
		});
		// A snapshot that is no longer the newest one can only be replaced.
		if (response.status === 409 && method === 'PATCH') return undefined;
		if (!response.ok) throw new Error('Failed to save snapshot');
		const snapshot = (await response.json().catch(() => undefined)) as SavedSnapshot | undefined;
		return typeof snapshot?.id === 'number' ? snapshot : undefined;
	}
}
