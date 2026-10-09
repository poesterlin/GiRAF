export type EditorFilters = {
	edited: 'any' | 'unedited' | 'edited';
	archived: 'any' | 'hide' | 'only';
	cutoff: 'workflow' | 'export';
	since?: string;
};

export function readEditorFilters(query: URLSearchParams): EditorFilters {
	const legacy = query.get('filter');
	const edited = query.get('edited') ?? (legacy === 'unedited' ? 'unedited' : legacy === 'edited' || legacy === 'changed' ? 'edited' : 'any');
	const archived = query.get('archived') ?? (legacy === 'archived' ? 'only' : legacy === 'no-archived' || legacy === 'unedited' ? 'hide' : 'any');
	const since = query.get('since') ?? query.get('uneditedSince');
	return {
		edited: edited === 'edited' || edited === 'unedited' ? edited : 'any',
		archived: archived === 'hide' || archived === 'only' ? archived : 'any',
		cutoff: query.get('cutoff') === 'export' || legacy === 'changed' ? 'export' : 'workflow',
		...(since && Number.isFinite(new Date(since).getTime()) ? { since } : {})
	};
}

export function editorFilterQuery(filters: EditorFilters): string {
	const query = new URLSearchParams({ edited: filters.edited, archived: filters.archived, cutoff: filters.cutoff });
	if (filters.cutoff === 'workflow' && filters.since) query.set('since', filters.since);
	return `?${query}`;
}

export function hasEditorFilters(query: URLSearchParams): boolean {
	const filters = readEditorFilters(query);
	return filters.edited !== 'any' || filters.archived !== 'any';
}
