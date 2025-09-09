
import { db } from '$lib/server/db';
import { profileTable } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export async function DELETE({ params }: { params: { id: string } }) {
	const id = Number(params.id);
	if (isNaN(id)) {
		return new Response('Invalid ID', { status: 400 });
	}

	await db.delete(profileTable).where(eq(profileTable.id, id));

	return new Response(null, { status: 204 });
}
