import { expect, test } from 'bun:test';
import { changeKind } from './export-changes';

const exportedAt = new Date('2026-10-01T10:00:00Z');
const later = new Date('2026-10-02T10:00:00Z');
const earlier = new Date('2026-09-30T10:00:00Z');

test('a photo that was never exported is pending as added', () => {
	expect(changeKind({ lastExportedAt: null, updatedAt: later }, true)).toBe('added');
	expect(changeKind({ lastExportedAt: null, updatedAt: later }, false)).toBe('added');
});

test('an edit after the last export makes a photo pending', () => {
	expect(changeKind({ lastExportedAt: exportedAt, updatedAt: later }, true)).toBe('edited');
});

test('a photo exported after its last edit is up to date', () => {
	expect(changeKind({ lastExportedAt: exportedAt, updatedAt: earlier }, true)).toBeNull();
	expect(changeKind({ lastExportedAt: exportedAt, updatedAt: exportedAt }, true)).toBeNull();
});

test('an export file that disappeared is pending even without edits', () => {
	expect(changeKind({ lastExportedAt: exportedAt, updatedAt: earlier }, false)).toBe('missing');
});

test('an edited photo whose export file is gone is still reported as edited', () => {
	expect(changeKind({ lastExportedAt: exportedAt, updatedAt: later }, false)).toBe('edited');
});
