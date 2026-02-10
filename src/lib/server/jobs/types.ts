export type JobId = number;

export enum JobType {
	IMPORT = 'import',
	EXPORT = 'export'
}

export interface Job<T> {
	id: JobId;
	type: JobType;
	payload: T;
}

export interface ImportPayload {
	sessionId: JobId;
}

export interface ExportPayload {
	sessionId: JobId;
}

export interface JobResult {
	status: 'success' | 'error';
	message?: string;
}

export type JobStatus = 'idle' | 'running' | 'success' | 'error' | 'cancelled';

export interface JobState {
	id: JobId;
	type: JobType;
	status: JobStatus;
	message?: string;
	updatedAt: string;
}


