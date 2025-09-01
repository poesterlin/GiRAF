import { db } from '$lib/server/db';
import { imageTable, importTable, sessionTable, type Import } from '$lib/server/db/schema';
import { error, json, type RequestHandler } from '@sveltejs/kit';
import { and, desc, gt, inArray, isNull } from 'drizzle-orm';

const PAGE_SIZE = 20;

export interface ImportResponse {
    items: Import[];
    next: number | null;
}

export const GET: RequestHandler = async ({ url }) => {
    const cursor = Number(url.searchParams.get('cursor')) || 0;

    const items = await db.query.importTable.findMany({
        limit: PAGE_SIZE,
        where: and(gt(importTable.id, cursor), isNull(importTable.importedAt)),
        orderBy: desc(importTable.id)
    });

    let next: number | null = null;
    if (items.length === PAGE_SIZE) {
        const lastItem = items[items.length - 1];
        if (lastItem) {
            next = lastItem.id;
        }
    }

    return json({ items, next });
}


export const POST: RequestHandler = async ({ request }) => {
    const { name, importIds } = await request.json();

    if (!name || !Array.isArray(importIds) || importIds.length === 0) {
        error(400, 'Missing name or importIds');
    }

    await db.transaction(async (tx) => {
        const [session] = await tx
            .insert(sessionTable)
            .values({ name, startedAt: new Date() })
            .returning();

        if (!session) {
            tx.rollback();
            return;
        }

        const importsToProcess = await tx.query.importTable.findMany({
            where: inArray(importTable.id, importIds)
        });

        if (importsToProcess.length !== importIds.length) {
            tx.rollback();
            return;
        }

        const newImages = importsToProcess.map((imp) => ({
            createdAt: new Date(),
            updatedAt: new Date(),
            filepath: imp.filePath,
            sessionId: session.id,
        }));

        await tx.insert(imageTable).values(newImages);

        await tx.update(importTable).set({ importedAt: new Date() }).where(inArray(importTable.id, importIds));

        return session;
    });

    // TODO: start import job, convert to tiffs
    // import ImportPP3 from "$lib/assets/import.pp3?raw";
    // const output = await editImage(path, ImportPP3, true, 16);

    return new Response();
};
