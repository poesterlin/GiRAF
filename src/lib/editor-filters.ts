export type EditorFilters = {
	edited: 'any' | 'unedited' | 'edited';
	archived: 'any' | 'hide' | 'only';
	cutoff: 'workflow' | 'export' | 'custom';
	since?: string;
	newlyImported?: boolean;
};

export function readEditorFilters(query: URLSearchParams): EditorFilters {
	const legacy = query.get('filter');
	const edited = query.get('edited') ?? (legacy === 'unedited' ? 'unedited' : legacy === 'edited' || legacy === 'changed' ? 'edited' : 'any');
	const archived = query.get('archived') ?? (legacy === 'archived' ? 'only' : legacy === 'none' ? 'any' : 'hide');
	const since = query.get('since') ?? query.get('uneditedSince');
	return {
		edited: edited === 'edited' || edited === 'unedited' ? edited : 'any',
		archived: archived === 'any' || archived === 'only' ? archived : 'hide',
		cutoff: query.get('cutoff') === 'custom' ? 'custom' : query.get('cutoff') === 'export' || legacy === 'changed' ? 'export' : 'workflow',
		...(since && Number.isFinite(new Date(since).getTime()) ? { since } : {}),
		...(query.get('imported') === 'new' ? { newlyImported: true } : {})
	};
}

export function editorFilterQuery(filters: EditorFilters): string {
	const query = new URLSearchParams({ edited: filters.edited, archived: filters.archived, cutoff: filters.cutoff });
	if (filters.cutoff !== 'export' && filters.since) query.set('since', filters.since);
	if (filters.newlyImported) query.set('imported', 'new');
	return `?${query}`;
}

export function hasEditorFilters(query: URLSearchParams): boolean {
	const filters = readEditorFilters(query);
	return filters.edited !== 'any' || filters.archived !== 'any' || !!filters.newlyImported;
}
