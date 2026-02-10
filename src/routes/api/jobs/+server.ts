import { jobManager } from '$lib/server/jobs/manager';
import { json, type RequestHandler } from '@sveltejs/kit';

export const GET: RequestHandler = async () => {
	const runningCount = jobManager.getActiveJobs().length;
	return json({
		runningCount,
		isRunning: runningCount > 0
	});
};
