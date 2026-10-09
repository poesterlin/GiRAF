import { expect, test } from 'bun:test';
import { editorFilterQuery, hasEditorFilters, readEditorFilters, type EditorFilters } from './editor-filters';

test('all combinations preserve independent filter states and the workflow timestamp', () => {
	for (const edited of ['any', 'unedited', 'edited'] as const) {
		for (const archived of ['any', 'hide', 'only'] as const) {
			const filters: EditorFilters = { edited, archived, cutoff: 'workflow', since: '2026-10-09T15:00:00.000Z' };
			const query = new URLSearchParams(editorFilterQuery(filters).slice(1));
			expect(readEditorFilters(query)).toEqual(filters);
			expect(hasEditorFilters(query)).toBe(edited !== 'any' || archived !== 'any');
		}
	}
});

test('last export drops the workflow cutoff from navigation', () => {
	const query = new URLSearchParams(editorFilterQuery({ edited: 'edited', archived: 'hide', cutoff: 'export', since: '2026-10-09T15:00:00Z' }).slice(1));
	expect(query.has('since')).toBe(false);
	expect(readEditorFilters(query)).toEqual({ edited: 'edited', archived: 'hide', cutoff: 'export' });
});

test('custom timestamps preserve the chosen instant through navigation', () => {
	const filters: EditorFilters = { edited: 'unedited', archived: 'only', cutoff: 'custom', since: '2026-10-08T12:34:56.000Z' };
	expect(readEditorFilters(new URLSearchParams(editorFilterQuery(filters).slice(1)))).toEqual(filters);
	expect(readEditorFilters(new URLSearchParams('edited=unedited&cutoff=custom&since=invalid'))).toEqual({ edited: 'unedited', archived: 'hide', cutoff: 'custom' });
});

test('legacy bookmarks remain usable and explicit categories override legacy defaults', () => {
	expect(readEditorFilters(new URLSearchParams('filter=unedited&uneditedSince=2026-10-09T15:00:00Z'))).toEqual({ edited: 'unedited', archived: 'hide', cutoff: 'workflow', since: '2026-10-09T15:00:00Z' });
	expect(readEditorFilters(new URLSearchParams('filter=changed'))).toEqual({ edited: 'edited', archived: 'hide', cutoff: 'export' });
	expect(readEditorFilters(new URLSearchParams('filter=archived&archived=hide&edited=unedited'))).toEqual({ edited: 'unedited', archived: 'hide', cutoff: 'workflow' });
});

test('invalid categories and timestamps fall back to valid defaults', () => {
	expect(readEditorFilters(new URLSearchParams('edited=bad&archived=bad&since=bad'))).toEqual({ edited: 'any', archived: 'hide', cutoff: 'workflow' });
});

test('newly imported filter works independently and combines with edited and archive states', () => {
	for (const edited of ['any', 'unedited', 'edited'] as const) {
		const filters: EditorFilters = { edited, archived: 'hide', cutoff: 'export', newlyImported: true };
		expect(readEditorFilters(new URLSearchParams(editorFilterQuery(filters).slice(1)))).toEqual(filters);
	}
	expect(hasEditorFilters(new URLSearchParams('imported=new'))).toBe(true);
	expect(editorFilterQuery({ edited: 'any', archived: 'any', cutoff: 'workflow' })).not.toContain('imported=');
});
