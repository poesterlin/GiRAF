import { invalidateAll } from '$app/navigation';
import pLimit from 'p-limit';
import { checkUploadDuplicates, cacheFileFingerprint } from '$lib/upload-duplicates';
import { getLocalFingerprint } from '$lib/local-preview-client';
import { createUploadAssignment, type UploadSessionTarget } from '$lib/upload-assignment';
import { app } from './app.svelte';
import { importTiming } from '$lib/import-timing';
import { prepareUploadSource } from '$lib/upload-source';
import { UploadConcurrency } from '$lib/upload-concurrency';
import { uploadResumable } from '$lib/resumable-upload';

export type { UploadSessionTarget } from '$lib/upload-assignment';
export type UploadBatchResult = { failedFiles: File[]; assignmentFailed: boolean; sessionId?: number };
export type UploadOptions = {
	onFilePrepared?: (original: File, prepared: File) => Promise<void>;
	onFileUploaded?: (file: File, id?: number, imported?: boolean, date?: string) => void;
	onFileDuplicate?: (file: File, date?: string) => void;
	onFileFailed?: (file: File, error: unknown) => void;
};

class UploadState {
	isUploading = $state(false);
	total = $state(0);
	completed = $state(0);
	failed = $state(0);
	progress = $state(0);
	visible = $state(false);
	checking = $state(0);
	private limit = pLimit(1);
	private bandwidth = new UploadConcurrency();
	private bandwidthTimer: ReturnType<typeof setInterval> | undefined;
	private bytesSent = 0;
	private transfers: { size: number; loaded: number; sending: boolean; finished: boolean }[] = [];
	private batches = 0;
	private assignmentFailed = false;

	async upload(files: FileList | File[], target?: UploadSessionTarget, options: UploadOptions = {}): Promise<UploadBatchResult> {
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
		const batchStarted = performance.now();
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
		const transfers = fileArray.map((file) => ({ size: file.size, loaded: 0, sending: false, finished: false }));
		this.transfers.push(...transfers);
		if (this.batches === 1) {
			this.bytesSent = 0;
			this.limit.concurrency = 1;
			this.bandwidth.reset(performance.now());
			this.bandwidthTimer = setInterval(() => {
				const largest = this.transfers.reduce((size, transfer) => (transfer.finished ? size : Math.max(size, transfer.size)), 0);
				this.limit.concurrency = this.bandwidth.sample(
					this.bytesSent,
					largest,
					this.transfers.some((transfer) => transfer.sending),
					performance.now()
				);
			}, 2000);
		}
		const updateProgress = () => {
			const totalBytes = this.transfers.reduce((sum, file) => sum + file.size, 0);
			this.progress = totalBytes ? (this.transfers.reduce((sum, file) => sum + file.loaded, 0) / totalBytes) * 100 : (this.completed / this.total) * 100;
		};
		updateProgress();
		try {
			await Promise.all(
				fileArray.map((file, index) => {
					const processFile = async () => {
						let previewWork: Promise<void> | undefined;
						importTiming('upload.queue', batchStarted, { file: file.name });
						try {
							const readStarted = performance.now();
							const source = await prepareUploadSource(file);
							importTiming('upload.source-ready', readStarted, { file: file.name, bytes: file.size, buffered: source !== file });
							previewWork = options.onFilePrepared?.(file, source).catch((error) => console.error('Preview preparation failed', error));
							this.checking += 1;
							let check;
							let fingerprint: string;
							try {
								const hashStarted = performance.now();
								fingerprint = await getLocalFingerprint(source);
								cacheFileFingerprint(source, fingerprint);
								importTiming('upload.hash', hashStarted, { file: file.name, bytes: file.size });
								const checkStarted = performance.now();
								try {
									[check] = await checkUploadDuplicates([source]);
								} catch (error) {
									// Finalization also deduplicates. An unavailable preflight
									// must not defeat the resumable transport's retry policy.
									importTiming('upload.duplicate-check-unavailable', checkStarted, { file: file.name, error: String(error) });
								}
								importTiming('upload.duplicate-check', checkStarted, { file: file.name, duplicate: check?.duplicate });
							} finally {
								this.checking -= 1;
							}
							if (check?.duplicate) {
								options.onFileDuplicate?.(file, check.date);
								if (!check.imported && check.id !== undefined) await assignFile(file, [check.id]);
								options.onFileUploaded?.(file, check.id, check.imported, check.date);
								return;
							}
							const uploaded = await uploadResumable(source, fingerprint!, {
								onBytes: (delta) => {
									this.bytesSent += delta;
								},
								onProgress: (loaded) => {
									transfers[index].loaded = loaded;
									updateProgress();
								},
								onSending: (sending) => {
									transfers[index].sending = sending;
								}
							});
							if (uploaded.status === 'skipped') options.onFileDuplicate?.(file, uploaded.date);
							const importIds = uploaded.id === undefined ? [] : [uploaded.id];
							await assignFile(file, importIds);
							options.onFileUploaded?.(file, importIds[0], !importIds.length, uploaded.date);
						} catch (error) {
							importTiming('upload.error', batchStarted, { file: file.name, error: String(error) });
							options.onFileFailed?.(file, error);
							result.failedFiles.push(file);
							this.failed += 1;
							console.error(`Upload failed: ${file.name}`, error);
							app.addToast(`Failed to upload ${file.name}: ${error instanceof Error ? error.message : String(error)}`, 'error');
						} finally {
							transfers[index].sending = false;
							transfers[index].finished = true;
							// Release the upload slot only once its buffered preview is also finished.
							await previewWork;
							this.completed += 1;
							transfers[index].loaded = file.size;
							updateProgress();
						}
					};
					return this.limit(processFile);
				})
			);
		} finally {
			this.batches -= 1;
			if (this.isUploading && this.batches === 0) {
				clearInterval(this.bandwidthTimer);
				this.bandwidthTimer = undefined;
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
