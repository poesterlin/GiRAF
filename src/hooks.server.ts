import type { ServerInit } from '@sveltejs/kit';
import { sweepTemporaryFiles } from '$lib/server/tmp-sweep';
import { sweepUploads } from '$lib/server/upload-sweep';

/** A failing job must only log: an uncaught error in a Bun.cron callback would end the server. */
function logFailure(job: string) {
	return (cause: unknown) => console.error(`[${job}] Failed:`, cause);
}

const cleanTemporaryFiles = () => sweepTemporaryFiles().catch(logFailure('tmp-sweep'));
const cleanUploads = () => sweepUploads().catch(logFailure('upload-sweep'));

// Dev reloads run init again, so stop the jobs the previous run registered
const scheduled = globalThis as typeof globalThis & { girafCronJobs?: Bun.CronJob[] };

export const init: ServerInit = () => {
	// Runs in the background so a large leftover pile never delays the first request
	void cleanTemporaryFiles();
	void cleanUploads();

	scheduled.girafCronJobs?.forEach((job) => job.stop());
	// unref: the jobs alone never keep the process running
	scheduled.girafCronJobs = [Bun.cron('17 * * * *', cleanUploads).unref(), Bun.cron('43 3 * * *', cleanTemporaryFiles).unref()];
};
