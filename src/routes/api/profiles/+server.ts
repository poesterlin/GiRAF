
import { db } from '$lib/server/db';
import { profileTable } from '$lib/server/db/schema';
import { json } from '@sveltejs/kit';
import { desc } from 'drizzle-orm';

export async function GET() {
	const profiles = await db.query.profileTable.findMany({
		orderBy: desc(profileTable.createdAt)
	});
	return json(profiles);
}

export async function POST({ request }: { request: Request }) {
	const { name, pp3 } = await request.json();
	if (!name || !pp3) {
		return new Response('Missing name or pp3', { status: 400 });
	}
	const [newProfile] = await db.insert(profileTable).values({ name, pp3 }).returning();
	return json(newProfile, { status: 201 });
}
