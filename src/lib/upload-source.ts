import pLimit from 'p-limit';

// Three upload slots retain at most 3 x 64 MiB of source data. Never buffer a batch.
const MAX_BUFFERED_FILE = 64 * 1024 * 1024;
const cameraRead = pLimit(1);

/** Snapshot small RAWs once so hashing, previews and XHR do not reopen the camera. */
export function prepareUploadSource(file: File): Promise<File> {
	return cameraRead(async () => {
		if (file.size > MAX_BUFFERED_FILE) return file;
		const bytes = await file.arrayBuffer();
		return new File([bytes], file.name, { type: file.type, lastModified: file.lastModified });
	});
}
