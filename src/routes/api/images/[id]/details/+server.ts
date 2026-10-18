import { db } from '$lib/server/db';
import { imageTable } from '$lib/server/db/schema';
import { json, type RequestHandler } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';

export const GET: RequestHandler = async ({ params }) => {
	const imageId = Number(params.id);
	const image = await db.query.imageTable.findFirst({
		where: eq(imageTable.id, imageId)
	});
	return json(image);
};

export const PUT: RequestHandler = async ({ request, params }) => {
	const imageId = Number(params.id);
	const { rating, isArchived } = await request.json();

	const [updatedImage] = await db.update(imageTable).set({ rating, isArchived }).where(eq(imageTable.id, imageId)).returning();

	return json(updatedImage);
};
