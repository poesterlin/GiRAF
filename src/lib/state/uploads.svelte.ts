import { invalidateAll } from '$app/navigation';
import pLimit from 'p-limit';
import { checkUploadDuplicates } from '$lib/upload-duplicates';
import { createUploadAssignment, type UploadSessionTarget } from '$lib/upload-assignment';
import { app } from './app.svelte';

export type { UploadSessionTarget } from '$lib/upload-assignment';
export type UploadBatchResult = { failedFiles: File[]; assignmentFailed: boolean; sessionId?: number };

class UploadState {
	isUploading = $state(false);
	total = $state(0);
	completed = $state(0);
	failed = $state(0);
	progress = $state(0);
	visible = $state(false);
	checking = $state(0);
	private limit = pLimit(3);
	private transfers: { size: number; loaded: number }[] = [];
	private batches = 0;
	private assignmentFailed = false;

	async upload(files: FileList | File[], target?: UploadSessionTarget): Promise<UploadBatchResult> {
		const result: UploadBatchResult = { failedFiles: [], assignmentFailed: false };
		if (files.length === 0) return result;
		const capturedTarget = target ? { ...target } : undefined;
		const assign = capturedTarget
			? createUploadAssignment(capturedTarget, (id) => {
					result.sessionId = id;
				})
			: undefined;
		const assignFile = async (file: File, ids: number[]) => {
			if (!assign || !ids.length) return;
			try {
				await assign(ids);
			} catch (error) {
				result.assignmentFailed = true;
				this.assignmentFailed = true;
				result.failedFiles.push(file);
				this.failed += 1;
				app.addToast(
					`Uploaded ${file.name}, but session assignment failed. The file remains in the import queue: ${error instanceof Error ? error.message : String(error)}`,
					'error'
				);
			}
		};
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
		app.addToast(`Starting upload of ${fileArray.length} file${fileArray.length === 1 ? '' : 's'}…`, 'info');
		const transfers = fileArray.map((file) => ({ size: file.size, loaded: 0 }));
		this.transfers.push(...transfers);
		const updateProgress = () => {
			const totalBytes = this.transfers.reduce((sum, file) => sum + file.size, 0);
			this.progress = totalBytes ? Math.round((this.transfers.reduce((sum, file) => sum + file.loaded, 0) / totalBytes) * 100) : Math.round((this.completed / this.total) * 100);
		};
		updateProgress();
		try {
			this.checking += 1;
			let checks;
			try {
				checks = await checkUploadDuplicates(fileArray);
			} catch (error) {
				this.failed += fileArray.length;
				this.completed += fileArray.length;
				for (const transfer of transfers) transfer.loaded = transfer.size;
				updateProgress();
				app.addToast(error instanceof Error ? error.message : 'Duplicate check failed', 'error');
				return { failedFiles: fileArray, assignmentFailed: false };
			} finally {
				this.checking -= 1;
			}
			await Promise.all(
				fileArray.map((file, index) => {
					const check = checks.find((check) => check.key === String(index));
					const processFile = async () => {
						try {
							if (check?.duplicate) {
								if (!check.imported && check.id !== undefined) await assignFile(file, [check.id]);
								app.addToast(`Skipped ${file.name}: already ${check.imported ? 'imported' : 'uploaded'}`, 'info');
								return;
							}
							const importIds = await new Promise<number[]>((resolve, reject) => {
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
										resolve(payload.results.flatMap((result) => (result.id === undefined ? [] : [result.id])));
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
							await assignFile(file, importIds);
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
					};
					return check?.duplicate ? processFile() : this.limit(processFile);
				})
			);
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
