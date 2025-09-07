import { db } from '$lib/server/db';
import {  imageToTagTable, tagTable } from '$lib/server/db/schema';
import type { RequestHandler } from '@sveltejs/kit';
import { error, json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';

export const POST: RequestHandler = async ({ params, request }) => {
	const { tags } = await request.json();
	const id = params.id ? parseInt(params.id, 10) : undefined;

	if (id === undefined) {
		throw error(400, 'Invalid image ID');
	}

	if (isNaN(id)) {
		throw error(400, 'Invalid image ID');
	}

	// Start a transaction to handle tag updates
	await db.transaction(async (tx) => {
		// Remove existing tags for this image
		await tx.delete(imageToTagTable).where(eq(imageToTagTable.imageId, id));

		// If tags are provided, add new ones
		if (tags && tags.length > 0) {
			// Create or get tag IDs for each tag name
			const tagIds: number[] = [];

			for (const tagName of tags) {
				// Check if tag already exists
				const existingTag = await tx.select().from(tagTable).where(eq(tagTable.name, tagName)).limit(1);

				let tagId: number;

				if (existingTag.length > 0) {
					tagId = existingTag[0].id;
				} else {
					// Create new tag
					const newTag = await tx.insert(tagTable).values({ name: tagName }).returning({ id: tagTable.id });
					tagId = newTag[0].id;
				}

				tagIds.push(tagId);
			}

			// Create image-to-tag relationships
			if (tagIds.length > 0) {
				await tx.insert(imageToTagTable).values(
					tagIds.map((tagId) => ({
						imageId: id,
						tagId
					}))
				);
			}
		}
	});

	return json({ success: true });
};
