import { pgTable, serial, integer, text, timestamp } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const sessionTable = pgTable('session', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' }).notNull(),
	endedAt: timestamp('ended_at', { withTimezone: true, mode: 'date' })
});

export type Session = typeof sessionTable.$inferSelect;

export const sessionRelations = relations(sessionTable, ({ many }) => ({
	images: many(imageTable)
}));

export const imageTable = pgTable('image', {
	id: serial('id').primaryKey(),
	filename: text('filename').notNull(),
	createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
	updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
	sessionId: integer('session_id')
		.notNull()
		.references(() => sessionTable.id, { onDelete: 'cascade' })
});

export type Image = typeof imageTable.$inferSelect;

export const imageRelations = relations(imageTable, ({ one, many }) => ({
	session: one(sessionTable, {
		fields: [imageTable.sessionId],
		references: [sessionTable.id]
	}),
	edits: many(editTable)
}));

export const editTable = pgTable('edit', {
	id: serial('id').primaryKey(),
	pp3: text('pp3').notNull(), // This stores the RawTherapee profile string
	createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
	imageId: integer('image_id')
		.notNull()
		.references(() => imageTable.id, { onDelete: 'cascade' })
});

export type Edit = typeof editTable.$inferSelect;

export const editRelations = relations(editTable, ({ one }) => ({
	image: one(imageTable, {
		fields: [editTable.imageId],
		references: [imageTable.id]
	})
}));
