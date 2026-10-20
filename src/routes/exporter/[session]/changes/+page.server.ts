import { error } from '@sveltejs/kit';
import { and, eq, gt, isNotNull, isNull, lte, or } from 'drizzle-orm';
import { stat } from 'node:fs/promises';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { imageTable, sessionTable, snapshotTable } from '$lib/server/db/schema';
import { findExportPath } from '$lib/server/export-files';
import { changeKind, type ChangeKind } from '$lib/server/export-changes';
import { jobManager } from '$lib/server/jobs/manager';
import { JobType } from '$lib/server/jobs/types';

export type SessionChange = {
	kind: ChangeKind;
	imageId: number;
	name: string;
	/** When the change happened: import, last edit, or last export for a missing file. */
	at: Date;
	editCount: number;
	/** Latest edit, used to show the photo as it looks now. */
	snapshotId: number | null;
	/** The edit the export was rendered from, used for the before image and reverting. */
	beforeSnapshotId: number | null;
	version: number;
	lastExportedAt: Date | null;
	fileMissing: boolean;
};

export const load: PageServerLoad = async ({ params }) => {
	const sessionId = Number(params.session);
	if (!Number.isInteger(sessionId)) {
		error(404, { message: `Session with ID ${params.session} not found.` });
	}

	const session = await db.query.sessionTable.findFirst({
		where: eq(sessionTable.id, sessionId),
		with: {
			images: {
				columns: { id: true, name: true, createdAt: true, updatedAt: true, lastExportedAt: true, recordedAt: true, version: true },
				where: (images, { eq }) => eq(images.isArchived, false)
			}
		}
	});

	if (!session) {
		error(404, { message: `Session with ID ${sessionId} not found.` });
	}

	// Only snapshot metadata matters here, so the (large) PP3 bodies stay in the database.
	const editRows = await db
		.select({ id: snapshotTable.id, imageId: snapshotTable.imageId, createdAt: snapshotTable.createdAt })
		.from(snapshotTable)
		.innerJoin(imageTable, eq(imageTable.id, snapshotTable.imageId))
		.where(
			and(eq(imageTable.sessionId, sessionId), eq(imageTable.isArchived, false), or(isNull(imageTable.lastExportedAt), gt(snapshotTable.createdAt, imageTable.lastExportedAt)))
		);

	const editsByImage = new Map<number, { id: number; createdAt: Date }[]>();
	for (const row of editRows) {
		const edits = editsByImage.get(row.imageId) ?? [];
		edits.push({ id: row.id, createdAt: row.createdAt });
		editsByImage.set(row.imageId, edits);
	}

	// The version each photo was last exported from is the "before" state in the comparison.
	const beforeRows = await db
		.select({ id: snapshotTable.id, imageId: snapshotTable.imageId, createdAt: snapshotTable.createdAt })
		.from(snapshotTable)
		.innerJoin(imageTable, eq(imageTable.id, snapshotTable.imageId))
		.where(
			and(eq(imageTable.sessionId, sessionId), eq(imageTable.isArchived, false), isNotNull(imageTable.lastExportedAt), lte(snapshotTable.createdAt, imageTable.lastExportedAt))
		);

	const beforeByImage = new Map<number, { id: number; createdAt: Date }>();
	for (const row of beforeRows) {
		const current = beforeByImage.get(row.imageId);
		if (!current || current.createdAt < row.createdAt || (current.createdAt.getTime() === row.createdAt.getTime() && current.id < row.id)) {
			beforeByImage.set(row.imageId, { id: row.id, createdAt: row.createdAt });
		}
	}

	const changes = (
		await Promise.all(
			session.images.map(async (image): Promise<SessionChange | null> => {
				const exportPath = await findExportPath(image, session);
				const fileExists = await stat(exportPath)
					.then((file) => file.isFile())
					.catch(() => false);
				const kind = changeKind(image, fileExists);
				if (!kind) return null;

				const edits = (editsByImage.get(image.id) ?? []).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id - b.id);
				const lastEdit = edits.at(-1) ?? null;
				const at = kind === 'added' ? image.createdAt : kind === 'edited' ? (lastEdit?.createdAt ?? image.updatedAt) : (image.lastExportedAt ?? image.updatedAt);

				return {
					kind,
					imageId: image.id,
					name: image.name,
					at,
					editCount: edits.length,
					snapshotId: lastEdit?.id ?? null,
					beforeSnapshotId: beforeByImage.get(image.id)?.id ?? null,
					version: image.version,
					lastExportedAt: image.lastExportedAt,
					fileMissing: !fileExists
				};
			})
		)
	)
		.filter((change): change is SessionChange => change !== null)
		.sort((a, b) => b.at.getTime() - a.at.getTime());

	const lastExportedAt = session.images.reduce<Date | null>((latest, image) => {
		if (!image.lastExportedAt) return latest;
		return !latest || latest < image.lastExportedAt ? image.lastExportedAt : latest;
	}, null);

	// Archived photos drop out of the export, so those archived since the last export belong in its change log.
	const archivedRows = await db.query.imageTable.findMany({
		columns: { id: true, name: true, version: true, archivedAt: true },
		where: and(eq(imageTable.sessionId, sessionId), eq(imageTable.isArchived, true), lastExportedAt ? gt(imageTable.archivedAt, lastExportedAt) : isNotNull(imageTable.archivedAt)),
		with: { snapshots: { columns: { id: true }, orderBy: (snapshots, { desc }) => [desc(snapshots.createdAt), desc(snapshots.id)], limit: 1 } },
		orderBy: (images, { desc }) => [desc(images.archivedAt)]
	});
	const archived = archivedRows.map((image) => ({
		imageId: image.id,
		name: image.name,
		version: image.version,
		at: image.archivedAt as Date,
		snapshotId: image.snapshots[0]?.id ?? null
	}));

	return {
		session: { id: session.id, name: session.name, startedAt: session.startedAt },
		imageCount: session.images.length,
		hasPriorExport: lastExportedAt !== null,
		lastExportedAt,
		changes,
		archived,
		exportJob: jobManager.getJobState(sessionId, JobType.EXPORT)
	};
};
