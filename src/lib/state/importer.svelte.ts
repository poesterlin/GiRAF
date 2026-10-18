import type { Import } from '$lib/server/db/schema';
import pLimit from 'p-limit';
import { uploads } from './uploads.svelte';
import { getLocalPreview, releaseLocalPreviewWorker } from '$lib/local-preview-client';
import { assignPendingUploads, type UploadSessionTarget } from '$lib/upload-assignment';
import { importTiming } from '$lib/import-timing';
import { invalidateAll } from '$app/navigation';
import { app } from './app.svelte';

export type ImageItem = Pick<Import, 'id' | 'date'> & {
	file?: File;
	url?: string;
	previewError?: string;
	importId?: number;
	status?: 'uploading' | 'queued' | 'assigned';
};

export function dateKey(date: Date | string) {
	const value = new Date(date);
	return new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime().toString();
}

/** Page-local workflow ownership; background transfers remain owned by uploads. */
export class ImporterState {
	items = $state<ImageItem[]>([]);
	duplicateCounts = $state<Record<string, number>>({});
	assigningIds = $state(new Set<number>());
	private nextId = -1;
	private alive = true;
	private previews = pLimit(2);
	private transfers = new Map<number, { promise: Promise<number | undefined>; resolve: (id: number | undefined) => void }>();

	constructor(
		private queued: () => ImageItem[],
		private onRemoved: (id: number) => void
	) {}

	get allItems(): ImageItem[] {
		return [...this.queued().filter((item) => !this.items.some((local) => local.importId === item.id)), ...this.items].sort(
			(a, b) => new Date(b.date).getTime() - new Date(a.date).getTime() || (b.importId ?? b.id) - (a.importId ?? a.id)
		);
	}

	unavailable(id: number) {
		return this.assigningIds.has(id) || this.items.some((item) => item.id === id && item.status === 'assigned');
	}

	private countDuplicate(date: Date | string) {
		const key = dateKey(date);
		this.duplicateCounts[key] = (this.duplicateCounts[key] ?? 0) + 1;
	}

	remove(id: number) {
		const item = this.items.find((item) => item.id === id);
		if (item?.url) URL.revokeObjectURL(item.url);
		this.items = this.items.filter((item) => item.id !== id);
		this.onRemoved(id);
	}

	private async preparePreview(id: number, file: File, started: number) {
		return this.previews(async () => {
			importTiming('preview.queue', started, { file: file.name, pending: this.previews.pendingCount });
			if (!this.alive || !this.items.some((item) => item.id === id)) return;
			try {
				const preview = await getLocalPreview(file);
				const item = this.items.find((item) => item.id === id);
				if (!this.alive || !item) {
					URL.revokeObjectURL(preview.url);
					return;
				}
				item.url = preview.url;
				importTiming('preview.ready', started, { file: file.name });
				if (preview.capturedAt && item.importId === undefined && item.status !== 'assigned') item.date = preview.capturedAt;
			} catch {
				const item = this.items.find((item) => item.id === id);
				if (this.alive && item) item.previewError = 'Preview unavailable';
			}
		});
	}

	stage(files: FileList | File[]) {
		const started = performance.now();
		importTiming('batch.selected', started, { files: files.length, bytes: Array.from(files).reduce((sum, file) => sum + file.size, 0) });
		const batch = new Map<File, ImageItem>();
		for (const file of Array.from(files)) {
			const existing = this.items.find((item) => item.file?.name === file.name && item.file.size === file.size && item.file.lastModified === file.lastModified);
			if (existing) {
				this.countDuplicate(existing.date);
				continue;
			}
			const id = this.nextId--;
			let resolve!: (id: number | undefined) => void;
			const promise = new Promise<number | undefined>((done) => {
				resolve = done;
			});
			this.transfers.set(id, { promise, resolve });
			const entry: ImageItem = { id, file, date: new Date(file.lastModified), status: 'uploading' };
			this.items.push(entry);
			batch.set(file, entry);
			// Thumbnail work has its own two-file queue and must not wait for an
			// upload slot or a stalled transfer. Read the local file directly.
			void this.preparePreview(id, file, started);
		}
		void uploads.upload([...batch.keys()], undefined, {
			onFileDuplicate: (file, date) => {
				if (this.alive) this.countDuplicate(date ?? this.items.find((item) => item.id === batch.get(file)!.id)?.date ?? batch.get(file)!.date);
			},
			onFileUploaded: (file, importId, imported, date) => {
				const id = batch.get(file)!.id;
				const item = this.items.find((item) => item.id === id);
				if (this.alive && item) {
					item.status = imported ? 'assigned' : 'queued';
					item.importId = importId;
					if (date) item.date = new Date(date);
				}
				this.transfers.get(id)?.resolve(imported ? undefined : importId);
				this.transfers.delete(id);
				if (
					this.alive &&
					!imported &&
					importId !== undefined &&
					(this.queued().some((queued) => queued.id === importId) || this.items.some((local) => local.id !== id && local.importId === importId))
				)
					this.remove(id);
			},
			onFileFailed: (file) => {
				const id = batch.get(file)!.id;
				this.transfers.get(id)?.resolve(undefined);
				this.transfers.delete(id);
				if (this.alive) this.remove(id);
			}
		});
	}

	async assign(items: ImageItem[], target: UploadSessionTarget) {
		this.assigningIds = new Set([...this.assigningIds, ...items.map((item) => item.id)]);
		try {
			await assignPendingUploads(
				items.map((item) => this.transfers.get(item.id)?.promise ?? Promise.resolve(item.importId ?? (item.id >= 0 ? item.id : undefined))),
				target,
				(indices) => {
					if (this.alive) {
						for (const index of indices) {
							const item = items[index];
							const local = this.items.find((entry) => entry.id === item.id);
							if (local) local.status = 'assigned';
							else this.items.push({ ...item, importId: item.id, status: 'assigned' });
						}
					}
					// One refresh per batch; the page data is large.
					void invalidateAll();
				},
				(error) => app.addToast(error instanceof Error ? error.message : 'Session assignment failed', 'error')
			);
		} finally {
			if (this.alive) this.assigningIds = new Set([...this.assigningIds].filter((id) => !items.some((item) => item.id === id)));
		}
	}

	dispose() {
		this.alive = false;
		for (const item of this.items) if (item.url) URL.revokeObjectURL(item.url);
		releaseLocalPreviewWorker();
	}
}
