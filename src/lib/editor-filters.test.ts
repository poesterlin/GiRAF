import { expect, test } from 'bun:test';
import { editorFilterQuery, editorTasks, filterSummary, hasEditorFilters, matchingTask, passProgress, readEditorFilters, taskFilters, type EditorFilters } from './editor-filters';

const since = '2026-10-09T15:00:00.000Z';

test('every combination survives a round trip through the address', () => {
	for (const show of ['all', 'todo', 'changed', 'edited'] as const) {
		for (const archived of ['any', 'hide', 'only'] as const) {
			for (const newlyImported of [false, true]) {
				const filters: EditorFilters = { show, archived, ...(show === 'todo' ? { since } : {}), ...(newlyImported ? { newlyImported } : {}) };
				const query = new URLSearchParams(editorFilterQuery(filters).slice(1));
				expect(readEditorFilters(query)).toEqual(filters);
				expect(hasEditorFilters(query)).toBe(show !== 'all' || archived !== 'hide' || newlyImported);
			}
		}
	}
});

test('the default view adds nothing to the address and does not count as filtered', () => {
	expect(editorFilterQuery({ show: 'all', archived: 'hide' })).toBe('');
	expect(hasEditorFilters(new URLSearchParams())).toBe(false);
	expect(filterSummary(readEditorFilters(new URLSearchParams()))).toBe('');
});

test('only a To edit pass keeps a start time', () => {
	expect(editorFilterQuery({ show: 'changed', archived: 'hide', since })).toBe('?show=changed');
	expect(readEditorFilters(new URLSearchParams(`show=edited&since=${since}`))).toEqual({ show: 'edited', archived: 'hide' });
	expect(readEditorFilters(new URLSearchParams('show=todo&since=invalid'))).toEqual({ show: 'todo', archived: 'hide' });
});

test('older links open the matching view', () => {
	expect(readEditorFilters(new URLSearchParams(`filter=unedited&uneditedSince=${since}`))).toEqual({ show: 'todo', archived: 'hide', since });
	expect(readEditorFilters(new URLSearchParams(`edited=unedited&archived=hide&cutoff=workflow&since=${since}`))).toEqual({ show: 'todo', archived: 'hide', since });
	expect(readEditorFilters(new URLSearchParams('filter=changed'))).toEqual({ show: 'changed', archived: 'hide' });
	expect(readEditorFilters(new URLSearchParams('edited=edited&cutoff=export'))).toEqual({ show: 'changed', archived: 'hide' });
	expect(readEditorFilters(new URLSearchParams(`edited=edited&cutoff=workflow&since=${since}`))).toEqual({ show: 'edited', archived: 'hide' });
	expect(readEditorFilters(new URLSearchParams('edited=any&archived=hide&cutoff=workflow'))).toEqual({ show: 'all', archived: 'hide' });
	expect(readEditorFilters(new URLSearchParams('filter=none'))).toEqual({ show: 'all', archived: 'any' });
	expect(readEditorFilters(new URLSearchParams('filter=archived&archived=hide&edited=unedited'))).toEqual({ show: 'todo', archived: 'hide' });
});

test('invalid values fall back to the defaults', () => {
	expect(readEditorFilters(new URLSearchParams('show=bad&archived=bad&since=bad'))).toEqual({ show: 'all', archived: 'hide' });
});

test('the summary names the matching task, or the settings for a custom filter', () => {
	expect(filterSummary({ show: 'todo', archived: 'hide', since })).toBe('Missed');
	expect(filterSummary({ show: 'todo', archived: 'hide', newlyImported: true })).toBe('New imports');
	expect(filterSummary({ show: 'all', archived: 'hide' })).toBe('');
	expect(filterSummary({ show: 'changed', archived: 'only', newlyImported: true })).toBe('Changed · Archived · New imports');
});

test('every task is distinct and found again from its own settings', () => {
	for (const task of editorTasks) expect(matchingTask(task.filters)).toBe(task);
	expect(matchingTask({ show: 'changed', archived: 'only' })).toBeUndefined();
});

test('the archived preference applies to every task but Archived', () => {
	const touchUp = editorTasks.find((task) => task.id === 'touchup')!;
	const archived = editorTasks.find((task) => task.id === 'archived')!;
	expect(taskFilters(touchUp, true)).toEqual({ show: 'edited', archived: 'any' });
	expect(taskFilters(archived, false)).toEqual({ show: 'all', archived: 'only' });
	expect(matchingTask({ show: 'edited', archived: 'any' })).toBe(touchUp);
	expect(filterSummary({ show: 'edited', archived: 'any' })).toBe('Edited + archived');
	expect(filterSummary({ show: 'all', archived: 'any' })).toBe('With archived');
});

test('a To edit pass counts the open photo as finished once it is saved', () => {
	expect(passProgress([1, 2, 3], [1], 2, false).remaining).toBe(2);
	const progress = passProgress([1, 2, 3], [1], 2, true);
	expect(progress.remaining).toBe(1);
	expect([...progress.finished]).toEqual([1, 2]);
	// A photo outside the list does not change the count
	expect(passProgress([1, 2, 3], [], 9, true).remaining).toBe(3);
});
