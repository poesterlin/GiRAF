/** Serializes snapshot writes; a failed write never blocks subsequent saves. */
export class SnapshotQueue {
	private tail: Promise<void> = Promise.resolve();
	private pending = new Map<string, number>();

	hasPending(imageId: string) {
		return this.pending.has(imageId);
	}

	save(imageId: string, pp3: string): Promise<void> {
		this.pending.set(imageId, (this.pending.get(imageId) ?? 0) + 1);
		const task = this.tail.catch(() => {}).then(async () => {
			try {
				const response = await fetch(`/api/images/${imageId}/snapshots`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					keepalive: true,
					body: JSON.stringify({ pp3 })
				});
				if (!response.ok) throw new Error('Failed to save snapshot');
			} finally {
				const remaining = (this.pending.get(imageId) ?? 1) - 1;
				if (remaining) this.pending.set(imageId, remaining);
				else this.pending.delete(imageId);
			}
		});
		this.tail = task;
		return task;
	}
}
