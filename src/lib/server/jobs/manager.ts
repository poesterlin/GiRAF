import { type Job, type JobId, type JobResult, JobType } from './types';
import { runImport, runExport } from './executor';

class JobManager {
	private activeJobs = new Map<JobId, AbortController>();

	public submit<T extends { sessionId: JobId }>(type: JobType, payload: T): { job: Job<T> } | null {
		const id = payload.sessionId;

		if (this.activeJobs.has(id)) {
			console.warn(`[JobManager] A job for session ${id} is already running.`);
			return null;
		}

		const job: Job<T> = { id, type, payload };
		const controller = new AbortController();
		this.activeJobs.set(id, controller);

		console.log(`[JobManager] Submitting job ${id} of type ${type}`);

		(async () => {
			let res: JobResult;
			try {
				switch (type) {
					case JobType.IMPORT:
						res = await runImport(payload as any, controller.signal);
						break;
					case JobType.EXPORT:
						res = await runExport(payload as any, controller.signal);
						break;
					default:
						throw new Error(`Unknown job type: ${type}`);
				}
				console.log(`[JobManager] Job ${id} completed with status: ${res.status}`);
			} catch (e: any) {
				console.error(`[JobManager] Job ${id} failed`, e);
			} finally {
				this.activeJobs.delete(id);
			}
		})();

		return { job };
	}

	public cancel(id: JobId): void {
		const controller = this.activeJobs.get(id);
		if (controller) {
			console.log(`[JobManager] Requesting cancellation for job ${id}`);
			controller.abort();
			this.activeJobs.delete(id);
		}
	}

	public getActiveJobs() {
		return Array.from(this.activeJobs.keys());
	}

	public terminate() {
		console.log('[JobManager] Terminating all active jobs.');
		for (const controller of this.activeJobs.values()) {
			controller.abort();
		}
		this.activeJobs.clear();
	}
}

// Export a singleton instance of the JobManager
export const jobManager = new JobManager();
