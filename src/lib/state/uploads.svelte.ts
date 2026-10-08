import { invalidateAll } from '$app/navigation';
import pLimit from 'p-limit';
import { SvelteSet } from 'svelte/reactivity';
import { checkUploadDuplicates } from '$lib/upload-duplicates';
import { app } from './app.svelte';

export type UploadSessionTarget = { name?: string; sessionId?: number };
export type UploadBatchResult = { failedFiles: File[]; assignmentFailed: boolean; sessionId?: number };

class UploadState {
	isUploading = $state(false);
	total = $state(0);
	completed = $state(0);
	failed = $state(0);
	progress = $state(0);
	visible = $state(false);
	private limit = pLimit(3);
	private transfers: { size: number; loaded: number }[] = [];
	private batches = 0;
	private assignmentFailed = false;

	async upload(files: FileList | File[], target?: UploadSessionTarget): Promise<UploadBatchResult> {
		const result: UploadBatchResult = { failedFiles: [], assignmentFailed: false };
		if (files.length === 0) return result;
		const capturedTarget = target ? { ...target } : undefined;
		const importIds = new SvelteSet<number>();
		let checks;
		try {
			checks = await checkUploadDuplicates(Array.from(files));
		} catch (error) {
			app.addToast(error instanceof Error ? error.message : 'Duplicate check failed', 'error');
			return { failedFiles: Array.from(files), assignmentFailed: false };
		}
		for (const check of checks) if (check.duplicate && check.id !== undefined && !check.imported) importIds.add(check.id);
		this.batches += 1;
		const fileArray = Array.from(files);
		if (!this.isUploading) {
			this.assignmentFailed = false;
			this.total = 0;
			this.completed = 0;
			this.failed = 0;
			this.transfers = [];
		}
		this.total += fileArray.length;
		this.visible = true;
		this.isUploading = true;
		const transfers = fileArray.map((file) => ({ size: file.size, loaded: 0 }));
		this.transfers.push(...transfers);
		const updateProgress = () => {
			const totalBytes = this.transfers.reduce((sum, file) => sum + file.size, 0);
			this.progress = totalBytes ? Math.round((this.transfers.reduce((sum, file) => sum + file.loaded, 0) / totalBytes) * 100) : Math.round((this.completed / this.total) * 100);
		};
		updateProgress();
		try {
			await Promise.all(
				fileArray.map((file, index) =>
					this.limit(async () => {
						try {
							const check = checks.find((check) => check.key === String(index));
							if (check?.duplicate) {
								app.addToast(`Skipped ${file.name}: already ${check.imported ? 'imported' : 'uploaded'}`, 'info');
								return;
							}
							await new Promise<void>((resolve, reject) => {
								const request = new XMLHttpRequest();
								request.open('POST', '/api/imports/upload');
								request.upload.onprogress = (event) => {
									if (event.lengthComputable) {
										transfers[index].loaded = file.size * (event.loaded / event.total);
										updateProgress();
									}
								};
								request.onload = () => {
									try {
										const payload = JSON.parse(request.responseText) as { message?: string; results?: { status: string; id?: number; message?: string }[] };
										if (request.status < 200 || request.status >= 300) throw new Error(payload.message || `Upload failed (${request.status})`);
										if (!payload.results?.length || payload.results.some((result) => result.status === 'error')) {
											throw new Error(payload.results?.find((result) => result.status === 'error')?.message || 'File processing failed');
										}
										for (const result of payload.results) if (result.id !== undefined) importIds.add(result.id);
										resolve();
									} catch (error) {
										reject(error);
									}
								};
								request.onerror = () => reject(new Error('Network error'));
								request.onabort = () => reject(new Error('Upload aborted'));
								const body = new FormData();
								body.append('files', file);
								if (capturedTarget) body.append('sessionAssigned', 'true');
								request.send(body);
							});
						} catch (error) {
							result.failedFiles.push(file);
							this.failed += 1;
							console.error(`Upload failed: ${file.name}`, error);
							app.addToast(`Failed to upload ${file.name}: ${error instanceof Error ? error.message : String(error)}`, 'error');
						} finally {
							this.completed += 1;
							transfers[index].loaded = file.size;
							updateProgress();
						}
					})
				)
			);
			if (capturedTarget && importIds.size) {
				try {
					const response = await fetch('/api/imports', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ ...capturedTarget, importIds: [...importIds] })
					});
					const payload = await response.json();
					if ((response.ok || payload.assignmentCommitted) && Number.isSafeInteger(payload.sessionId)) result.sessionId = payload.sessionId;
					if (!response.ok) {
						if (response.status === 409 && payload.assignmentCommitted) {
							app.addToast(payload.message || 'Files assigned; processing is already running.', 'info');
						} else throw new Error(payload.message || `Session assignment failed (${response.status})`);
					}
				} catch (error) {
					result.assignmentFailed = true;
					this.assignmentFailed = true;
					app.addToast(`Files uploaded, but session assignment failed: ${error instanceof Error ? error.message : String(error)}`, 'error');
				}
			}
		} finally {
			this.batches -= 1;
			if (this.isUploading && this.batches === 0) {
				this.isUploading = false;
				this.transfers = [];
				if (!this.assignmentFailed)
					app.addToast(
						this.failed ? `Uploaded ${this.completed - this.failed} of ${this.total} files. ${this.failed} failed.` : `Successfully uploaded ${this.total} files`,
						this.failed ? 'error' : 'success'
					);
				void invalidateAll().catch((error) => console.error('Failed to refresh uploads', error));
			}
		}
		return result;
	}
}

export const uploads = new UploadState();
