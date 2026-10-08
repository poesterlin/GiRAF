import { invalidateAll } from '$app/navigation';
import pLimit from 'p-limit';
import { app } from './app.svelte';

class UploadState {
	isUploading = $state(false);
	total = $state(0);
	completed = $state(0);
	failed = $state(0);
	progress = $state(0);
	visible = $state(false);
	private limit = pLimit(3);
	private transfers: { size: number; loaded: number }[] = [];

	async upload(files: FileList | File[]) {
		if (files.length === 0) return;
		const fileArray = Array.from(files);
		if (!this.isUploading) {
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
										if (request.status < 200 || request.status >= 300) throw new Error('Upload failed');
										const payload = JSON.parse(request.responseText) as { results?: { status: string }[] };
										if (!payload.results?.length || payload.results.some((result) => result.status === 'error')) {
											throw new Error('File processing failed');
										}
										resolve();
									} catch (error) {
										reject(error);
									}
								};
								request.onerror = () => reject(new Error('Network error'));
								request.onabort = () => reject(new Error('Upload aborted'));
								const body = new FormData();
								body.append('files', file);
								request.send(body);
							});
						} catch (error) {
							this.failed += 1;
							console.error(`Upload failed: ${file.name}`, error);
							app.addToast(`Failed to upload ${file.name}`, 'error');
						} finally {
							this.completed += 1;
							transfers[index].loaded = file.size;
							updateProgress();
						}
					})
				)
			);
		} finally {
			if (this.isUploading && this.completed === this.total) {
				this.isUploading = false;
				this.transfers = [];
				app.addToast(
					this.failed ? `Uploaded ${this.completed - this.failed} of ${this.total} files. ${this.failed} failed.` : `Successfully uploaded ${this.total} files`,
					this.failed ? 'error' : 'success'
				);
				void invalidateAll().catch((error) => console.error('Failed to refresh uploads', error));
			}
		}
	}
}

export const uploads = new UploadState();
