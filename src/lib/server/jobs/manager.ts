import { type Job, type JobId, type JobResult, type JobState, JobType } from './types';
import { runImport, runExport } from './executor';
import { appendNotification } from '$lib/server/notifications';
import { db } from '$lib/server/db';
import { sessionTable } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

class JobManager {
	private activeJobs = new Map<JobId, { type: JobType; controller: AbortController }>();
	private jobStates = new Map<string, JobState>();

	private getKey(type: JobType, id: JobId) {
		return `${type}:${id}`;
	}

	private getJobLabel(type: JobType) {
		return type === JobType.IMPORT ? 'Import' : 'Export';
	}

	private notify(message: string, type: 'success' | 'error' | 'info') {
		void appendNotification(message, type).catch((err) => {
			console.error('[JobManager] Failed to append notification', err);
		});
	}

	private async getSessionName(id: JobId): Promise<string> {
		try {
			const session = await db.query.sessionTable.findFirst({
				where: eq(sessionTable.id, id),
				columns: { name: true }
			});
			if (session?.name && session.name.length > 0) {
				return session.name;
			}
		} catch (err) {
			console.error('[JobManager] Failed to fetch session name', err);
		}
		return 'this session';
	}

	private notifyJobEvent(
		type: JobType,
		sessionId: JobId,
		status: 'started' | 'completed' | 'failed' | 'cancelled',
		errorMessage?: string
	) {
		void this.getSessionName(sessionId)
			.then((sessionName) => {
				const jobLabel = this.getJobLabel(type);
				switch (status) {
					case 'started':
						this.notify(`${jobLabel} started for "${sessionName}".`, 'info');
						break;
					case 'completed':
						this.notify(`${jobLabel} completed for "${sessionName}".`, 'success');
						break;
					case 'cancelled':
						this.notify(`${jobLabel} cancelled for "${sessionName}".`, 'info');
						break;
					case 'failed':
						this.notify(
							errorMessage
								? `${jobLabel} failed for "${sessionName}": ${errorMessage}`
								: `${jobLabel} failed for "${sessionName}".`,
							'error'
						);
						break;
				}
			})
			.catch((err) => {
				console.error('[JobManager] Failed to prepare job notification', err);
			});
	}

	public submit<T extends { sessionId: JobId }>(type: JobType, payload: T): { job: Job<T> } | null {
		const id = payload.sessionId;

		if (this.activeJobs.has(id)) {
			console.warn(`[JobManager] A job for session ${id} is already running.`);
			return null;
		}

		const job: Job<T> = { id, type, payload };
		const controller = new AbortController();
		this.activeJobs.set(id, { type, controller });
		this.jobStates.set(this.getKey(type, id), {
			id,
			type,
			status: 'running',
			updatedAt: new Date().toISOString()
		});
		this.notifyJobEvent(type, id, 'started');

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

				const status = controller.signal.aborted ? 'cancelled' : res.status;
				this.jobStates.set(this.getKey(type, id), {
					id,
					type,
					status,
					message: res.message,
					updatedAt: new Date().toISOString()
				});
				if (status === 'success') {
					this.notifyJobEvent(type, id, 'completed');
				}
			} catch (e: any) {
				console.error(`[JobManager] Job ${id} failed`, e);
				const status = controller.signal.aborted ? 'cancelled' : 'error';
				this.jobStates.set(this.getKey(type, id), {
					id,
					type,
					status,
					message: e?.message,
					updatedAt: new Date().toISOString()
				});
				if (status === 'error') {
					this.notifyJobEvent(type, id, 'failed', e?.message);
				}
			} finally {
				const activeJob = this.activeJobs.get(id);
				if (activeJob?.controller === controller) {
					this.activeJobs.delete(id);
				}
			}
		})();

		return { job };
	}

	public cancel(id: JobId): void {
		const activeJob = this.activeJobs.get(id);
		if (activeJob) {
			console.log(`[JobManager] Requesting cancellation for job ${id}`);
			activeJob.controller.abort();
			this.jobStates.set(this.getKey(activeJob.type, id), {
				id,
				type: activeJob.type,
				status: 'cancelled',
				updatedAt: new Date().toISOString()
			});
			this.notifyJobEvent(activeJob.type, id, 'cancelled');
		}
	}

	public getActiveJobs() {
		return Array.from(this.activeJobs.keys());
	}

	public getJobState(id: JobId, type: JobType): JobState {
		const activeJob = this.activeJobs.get(id);
		if (activeJob?.type === type) {
			const current = this.jobStates.get(this.getKey(type, id));
			return (
				current ?? {
					id,
					type,
					status: 'running',
					updatedAt: new Date().toISOString()
				}
			);
		}

		return (
			this.jobStates.get(this.getKey(type, id)) ?? {
				id,
				type,
				status: 'idle',
				updatedAt: new Date().toISOString()
			}
		);
	}

	public terminate() {
		console.log('[JobManager] Terminating all active jobs.');
		for (const [id, activeJob] of this.activeJobs.entries()) {
			activeJob.controller.abort();
			this.jobStates.set(this.getKey(activeJob.type, id), {
				id,
				type: activeJob.type,
				status: 'cancelled',
				updatedAt: new Date().toISOString()
			});
		}
		this.activeJobs.clear();
	}
}

// Export a singleton instance of the JobManager
export const jobManager = new JobManager();
