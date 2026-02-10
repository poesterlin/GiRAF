
import { jobManager } from '$lib/server/jobs/manager';
import { JobType } from '$lib/server/jobs/types';
import { db } from '$lib/server/db';
import { imageTable, importTable, sessionTable, type Import } from '$lib/server/db/schema';
import { error, json, type RequestHandler } from '@sveltejs/kit';
import { and, desc, eq, gt, inArray, isNull } from 'drizzle-orm';
import { ExifDateTime, exiftool } from 'exiftool-vendored';
import pLimit from 'p-limit';
import { cpus } from 'os';

const limit = pLimit(cpus().length);


export interface ImportResponse {
    items: Import[];
    next: number | null;
}

export const GET: RequestHandler = async ({ url }) => {
    const cursor = Number(url.searchParams.get('cursor')) || 0;

    const items = await db.query.importTable.findMany({
        where: and(gt(importTable.id, cursor), isNull(importTable.importedAt)),
        orderBy: desc(importTable.date)
    });

    return json({ items });
}

function minimumDate(dates: Array<Date | undefined>): Date | null {
    if (dates.length === 0) return null;
    return new Date(Math.min(...dates.map(d => d?.getTime() ?? Infinity)));
}

export const POST: RequestHandler = async ({ request }) => {
    const { name, importIds, sessionId: existingSessionId } = await request.json();

    if ((!name && !existingSessionId) || !Array.isArray(importIds) || importIds.length === 0) {
        error(400, 'Missing name/sessionId or importIds');
    }

    let sessionId: number | null = existingSessionId;
    const filePaths: string[] = [];

    await db.transaction(async (tx) => {
        if (!sessionId) {
            const [session] = await tx
                .insert(sessionTable)
                .values({ name, startedAt: new Date() })
                .returning();

            if (!session) {
                tx.rollback();
                return;
            }
            sessionId = session.id;
        }

        const imports = await tx.query.importTable.findMany({
            where: inArray(importTable.id, importIds)
        });

        if (imports.length !== importIds.length) {
            tx.rollback();
            return;
        }

        // Collect file paths for the job
        imports.forEach(i => filePaths.push(i.filePath));

        // TODO: add error handling
        const newImages = await Promise.all(imports.map(i => limit(() => getImageDetails(i, sessionId!))));

        const minDate = minimumDate(newImages.map(ni => ni.recordedAt));
        if (minDate) {
            const session = await tx.query.sessionTable.findFirst({
                where: eq(sessionTable.id, sessionId!)
            });

            if (session && session.startedAt > minDate) {
                await tx.update(sessionTable).set({ startedAt: minDate }).where(eq(sessionTable.id, sessionId!));
            }
        }

        await tx.insert(imageTable).values(newImages);
        await tx.update(importTable).set({ importedAt: new Date() }).where(inArray(importTable.id, importIds));

    });

    if (sessionId) {
        console.log(`[API] Submitting import job for session ${sessionId}.`);
        const submitted = jobManager.submit(JobType.IMPORT, { sessionId });
        if (!submitted) {
            return json({ message: 'An import job is already running for this session', sessionId }, { status: 409 });
        }
    }

    return json({ status: 'ok', sessionId }, { status: 202 });
};

async function getImageDetails(imp: { filePath: string }, sessionId: number): Promise<typeof imageTable.$inferInsert> {
    const metadata = await exiftool.read(imp.filePath);

    return {
        createdAt: new Date(),
        updatedAt: new Date(),
        filepath: imp.filePath,
        sessionId,
        version: 1,
        recordedAt: toDate(metadata.DateTimeOriginal),
        name: fallback(metadata.FileName, ''),
        resolutionX: fallback(metadata.ImageWidth, 0),
        resolutionY: fallback(metadata.ImageHeight, 0),
        rating: 0,
        iso: metadata.ISO,
        aperture: metadata.Aperture,
        exposure: metadata.ExposureTime,
        focalLength: metadata.FocalLength,
        camera: (fallback(metadata.Make, '') + ' ' + fallback(metadata.Model, '')).trim(),
        lens: metadata.Lens,
        // will get set later after conversion to tif
        // whiteBalance: pp3.White_Balance?.Temperature as number,
        // tint: pp3.White_Balance?.Green as number,
    };
}

function toDate(d: string | ExifDateTime | undefined): Date {
    if (!d) return new Date();

    if (typeof d === 'string') {
        return new Date(d);
    }

    return d.toDate();
}

function fallback<T extends NonNullable<any>>(t: T | undefined, fallbackValue: T): T {
    return t !== undefined ? t : fallbackValue;
}