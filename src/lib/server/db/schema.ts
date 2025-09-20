import { relations } from 'drizzle-orm';
import { foreignKey } from 'drizzle-orm/gel-core';
import { boolean, integer, jsonb, pgTable, primaryKey, real, serial, text, timestamp, type AnyPgColumn } from 'drizzle-orm/pg-core';

export const sessionTable = pgTable('session', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' }).notNull(),
	endedAt: timestamp('ended_at', { withTimezone: true, mode: 'date' }),
	isArchived: boolean('is_archived').notNull().default(false)
});

export type Session = typeof sessionTable.$inferSelect;

export const sessionRelations = relations(sessionTable, ({ many }) => ({
	images: many(imageTable),
	albums: many(albumTable)
}));

export const imageTable = pgTable('image', {
	id: serial('id').primaryKey(),
	filepath: text('filename').notNull(),
	previewPath: text('preview_path'),
	tifPath: text('tiff_path'),
	createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
	updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
	sessionId: integer('session_id')
		.notNull()
		.references(() => sessionTable.id, { onDelete: 'cascade' }),
	version: integer('version').notNull().default(1),
	recordedAt: timestamp('recorded_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
	name: text('name').notNull(),
	resolutionX: integer('resolution_x').notNull(),
	resolutionY: integer('resolution_y').notNull(),
	rating: integer('rating').notNull().default(0),
	iso: integer('iso'),
	aperture: real('aperture'),
	exposure: text('exposure'),
	focalLength: text('focal_length'),
	camera: text('camera'),
	lens: text('lens'),
	whiteBalance: real('white_balance'),
	tint: real('tint'),
	isArchived: boolean('is_archived').notNull().default(false),
	phash: text('phash'),
	stackId: integer('stack_id').references((): AnyPgColumn => imageTable.id),
	isStackBase: boolean('is_stack_base').notNull().default(false),
	lastExportedAt: timestamp('last_exported_at', { withTimezone: true, mode: 'date' }),
});

export type Image = typeof imageTable.$inferSelect;

export const imageRelations = relations(imageTable, ({ one, many }) => ({
	session: one(sessionTable, {
		fields: [imageTable.sessionId],
		references: [sessionTable.id]
	}),
	snapshots: many(snapshotTable),
	stackParent: one(imageTable, {
		fields: [imageTable.stackId],
		references: [imageTable.id],
		relationName: 'stack'
	}),
	stackChildren: many(imageTable, {
		relationName: 'stack'
	}),
	imageToTags: many(imageToTagTable)
}));

export const snapshotTable = pgTable('snapshot', {
	id: serial('id').primaryKey(),
	pp3: text('pp3').notNull(),
	createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
	imageId: integer('image_id')
		.notNull()
		.references(() => imageTable.id, { onDelete: 'cascade' }),
	isMarkedForExport: boolean('is_marked_for_export').notNull().default(false)
});

export type Snapshot = typeof snapshotTable.$inferSelect;

export const snapshotRelations = relations(snapshotTable, ({ one }) => ({
	image: one(imageTable, {
		fields: [snapshotTable.imageId],
		references: [imageTable.id]
	})
}));

export const importTable = pgTable('import', {
	id: serial('id').primaryKey(),
	filePath: text('file_path').notNull(),
	previewPath: text('preview_path'),
	date: timestamp('date', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
	importedAt: timestamp('imported_at', { withTimezone: true, mode: 'date' })
});

export type Import = typeof importTable.$inferSelect;

export const tagTable = pgTable('tag', {
	id: serial('id').primaryKey(),
	name: text('name').notNull()
});

export type Tag = typeof tagTable.$inferSelect;

export const imageToTagTable = pgTable('image_to_tag', {
	imageId: integer('image_id')
		.notNull()
		.references(() => imageTable.id, { onDelete: 'cascade' }),
	tagId: integer('tag_id')
		.notNull()
		.references(() => tagTable.id, { onDelete: 'cascade' })
}, (table) => [
	primaryKey({ columns: [table.imageId, table.tagId] })
]);

export const imageToTagRelations = relations(imageToTagTable, ({ one }) => ({
	image: one(imageTable, {
		fields: [imageToTagTable.imageId],
		references: [imageTable.id]
	}),
	tag: one(tagTable, {
		fields: [imageToTagTable.tagId],
		references: [tagTable.id]
	})
}));

export const profileTable = pgTable('profile', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	pp3: text('pp3').notNull(),
	createdAt: timestamp('created_at').defaultNow().notNull(),
});

export type Profile = typeof profileTable.$inferSelect;

export const albumTable = pgTable('album', {
	id: serial('id').primaryKey(),
	integration: text('integration').notNull(),
	externalId: text('external_id').notNull(),
	title: text('title'),
	url: text('url'),
	sessionId: integer('session_id')
		.references(() => sessionTable.id, { onDelete: 'cascade' }),
});

export const albumRelations = relations(albumTable, ({ one, many }) => ({
	media: many(mediaTable),
	session: one(sessionTable, {
		fields: [albumTable.sessionId],
		references: [sessionTable.id]
	})
}));

export type Album = typeof albumTable.$inferSelect;

export const mediaTable = pgTable('media', {
	id: serial('id').primaryKey(),
	imageId: integer('image_id')
		.notNull()
		.references(() => imageTable.id, { onDelete: 'cascade' }),
	albumId: integer('album_id')
		.notNull()
		.references(() => albumTable.id, { onDelete: 'cascade' }),
	externalId: text('external_id').notNull(),
	integration: text('integration').notNull(),
});

export const mediaRelations = relations(mediaTable, ({ one }) => ({
	image: one(imageTable, {
		fields: [mediaTable.imageId],
		references: [imageTable.id]
	}),
	album: one(albumTable, {
		fields: [mediaTable.albumId],
		references: [albumTable.id]
	}),
}));

export type Media = typeof mediaTable.$inferSelect;