import { json } from '@sveltejs/kit';
import { jobManager } from '$lib/server/jobs/manager';
import { JobType } from '$lib/server/jobs/types';
import { db } from '$lib/server/db';

export async function GET({ params }) {
	const sessionId = parseInt(params.id, 10);
	const job = jobManager.getJob(sessionId);

	if (job) {
		return json({ job });
	}

	return new Response(undefined, { status: 404 });
}

export async function POST({ params }) {
	const sessionId = parseInt(params.id, 10);

	const session = await db.query.sessionTable.findFirst({
		where: (sessions, { eq }) => eq(sessions.id, sessionId),
		with: {
			images: true
		}
	});

	if (!session) {
		return new Response('Session not found', { status: 404 });
	}

	jobManager.submit(JobType.EXPORT, { sessionId: session.id, images: session.images, name: session.name });

	return new Response(undefined, { status: 202 });
}

export async function DELETE({ params }) {
	const sessionId = parseInt(params.id, 10);
	jobManager.cancel(sessionId);
	return new Response(undefined, { status: 202 });
}