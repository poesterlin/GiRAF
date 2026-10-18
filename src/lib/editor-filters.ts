export type EditorShow = 'all' | 'todo' | 'changed' | 'edited';

export type EditorFilters = {
	show: EditorShow;
	archived: 'hide' | 'any' | 'only';
	/** When the "To edit" pass started. Photos edited after it stay in the list. */
	since?: string;
	newlyImported?: boolean;
};

const shows: EditorShow[] = ['all', 'todo', 'changed', 'edited'];

function validTime(value: string | null): value is string {
	return !!value && Number.isFinite(new Date(value).getTime());
}

/** Older links used `edited`, `cutoff` and `filter`; they map onto the matching view. */
function legacyShow(query: URLSearchParams): EditorShow {
	const legacy = query.get('filter');
	const edited = query.get('edited') ?? (legacy === 'unedited' ? 'unedited' : legacy === 'edited' || legacy === 'changed' ? 'edited' : 'any');
	if (edited === 'unedited') return 'todo';
	if (edited !== 'edited') return 'all';
	return query.get('cutoff') === 'export' || (!query.has('cutoff') && legacy === 'changed') ? 'changed' : 'edited';
}

export function readEditorFilters(query: URLSearchParams): EditorFilters {
	const requested = query.get('show') as EditorShow | null;
	const show = requested && shows.includes(requested) ? requested : legacyShow(query);
	const legacy = query.get('filter');
	const archived = query.get('archived') ?? (legacy === 'archived' ? 'only' : legacy === 'none' ? 'any' : 'hide');
	const since = query.get('since') ?? query.get('uneditedSince');
	return {
		show,
		archived: archived === 'any' || archived === 'only' ? archived : 'hide',
		...(show === 'todo' && validTime(since) ? { since } : {}),
		...(query.get('imported') === 'new' ? { newlyImported: true } : {})
	};
}

/** Only settings that differ from the defaults go into the address. */
export function editorFilterQuery(filters: EditorFilters): string {
	const query = new URLSearchParams();
	if (filters.show !== 'all') query.set('show', filters.show);
	if (filters.show === 'todo' && filters.since) query.set('since', filters.since);
	if (filters.archived !== 'hide') query.set('archived', filters.archived);
	if (filters.newlyImported) query.set('imported', 'new');
	const text = query.toString();
	return text ? `?${text}` : '';
}

export function isFiltered(filters: EditorFilters): boolean {
	return filters.show !== 'all' || filters.archived !== 'hide' || !!filters.newlyImported;
}

export function hasEditorFilters(query: URLSearchParams): boolean {
	return isFiltered(readEditorFilters(query));
}

const showLabels: Record<EditorShow, string> = {
	all: 'All',
	todo: 'To edit',
	changed: 'Changed',
	edited: 'Edited'
};

export type EditorTask = { id: string; label: string; short: string; filters: EditorFilters };

/** The jobs the filter is used for, each a fixed combination of settings. */
export const editorTasks: EditorTask[] = [
	{ id: 'new', label: 'Edit new imports', short: 'New imports', filters: { show: 'todo', archived: 'hide', newlyImported: true } },
	{ id: 'missed', label: 'Find missed photos', short: 'Missed', filters: { show: 'todo', archived: 'hide' } },
	{ id: 'export', label: 'Ready to export', short: 'To export', filters: { show: 'changed', archived: 'hide' } },
	{ id: 'touchup', label: 'Touch up edits', short: 'Edited', filters: { show: 'edited', archived: 'hide' } },
	{ id: 'archived', label: 'Archived', short: 'Archived', filters: { show: 'all', archived: 'only' } },
	{ id: 'all', label: 'All photos', short: '', filters: { show: 'all', archived: 'hide' } }
];

/** Archived photos are a preference for every task except Archived itself, which shows only them. */
export function matchingTask(filters: EditorFilters): EditorTask | undefined {
	if (filters.archived === 'only') return filters.show === 'all' && !filters.newlyImported ? editorTasks.find((task) => task.id === 'archived') : undefined;
	return editorTasks.find(({ filters: task }) => task.archived !== 'only' && task.show === filters.show && !!task.newlyImported === !!filters.newlyImported);
}

/** A task's settings with the archived preference applied. */
export function taskFilters(task: EditorTask, includeArchived: boolean): EditorFilters {
	return task.filters.archived === 'only' ? { ...task.filters } : { ...task.filters, archived: includeArchived ? 'any' : 'hide' };
}

/** A few words naming the active filter, for the navigation bar. */
export function filterSummary(filters: EditorFilters): string {
	const task = matchingTask(filters);
	if (task) {
		const withArchived = task.filters.archived !== 'only' && filters.archived === 'any';
		return withArchived ? (task.short ? `${task.short} + archived` : 'With archived') : task.short;
	}
	const parts: string[] = [];
	if (filters.show !== 'all') parts.push(showLabels[filters.show]);
	if (filters.archived === 'only') parts.push('Archived');
	else if (filters.archived === 'any') parts.push('With archived');
	if (filters.newlyImported) parts.push('New imports');
	return parts.join(' · ');
}

/** Which photos of a "To edit" list are finished, counting the open photo once autosave has written it. */
export function passProgress(ids: number[], finishedIds: number[], currentId: number, currentSaved: boolean) {
	const finished = new Set(finishedIds);
	if (currentSaved && ids.includes(currentId)) finished.add(currentId);
	return { finished, remaining: ids.filter((id) => !finished.has(id)).length };
}
