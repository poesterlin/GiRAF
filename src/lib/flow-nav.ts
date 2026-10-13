export type FlowPage = 'import' | 'gallery' | 'export';
export type SessionStage = 'triage' | 'editor';

export type FlowNavState = {
	/** Top level page highlighted in the bar, if any. */
	activePage: FlowPage | null;
	/** Session scoped stage, or null outside of a photo. */
	sessionStage: SessionStage | null;
	/** Session the photo belongs to, used as the back link label. */
	sessionName: string | null;
	/** Label of the active session stage. */
	stageLabel: string | null;
	/** Micro dots marking progress through the session stages. */
	stageSteps: { key: SessionStage; label: string; done: boolean; active: boolean }[];
};

const stageLabels: Record<SessionStage, string> = {
	triage: 'Triage',
	editor: 'Editor'
};

/**
 * Derives the top bar from the current path. Import, Gallery and Export are
 * pages; Triage and Editor are stages inside a session, so they are only
 * rendered when the path carries an image id.
 */
export function flowNavState({ pathname, triageEnabled, sessionName = null }: { pathname: string; triageEnabled: boolean; sessionName?: string | null }): FlowNavState {
	let activePage: FlowPage | null = null;
	let sessionStage: SessionStage | null = null;

	if (/^\/triage\/\d+/.test(pathname)) {
		sessionStage = triageEnabled ? 'triage' : null;
	} else if (/^\/editor\/\d+/.test(pathname)) {
		sessionStage = 'editor';
	} else if (/^\/importer(\/|$)/.test(pathname)) {
		activePage = 'import';
	} else if (/^\/gallery(\/|$)/.test(pathname)) {
		activePage = 'gallery';
	} else if (/^\/exporter(\/|$)/.test(pathname)) {
		activePage = 'export';
	}

	const stages: SessionStage[] = triageEnabled ? ['triage', 'editor'] : ['editor'];
	const activeIndex = sessionStage ? stages.indexOf(sessionStage) : -1;

	return {
		activePage,
		sessionStage,
		sessionName: sessionStage ? sessionName : null,
		stageLabel: sessionStage ? stageLabels[sessionStage] : null,
		stageSteps: stages.map((key, index) => ({
			key,
			label: stageLabels[key],
			done: activeIndex >= 0 && index < activeIndex,
			active: index === activeIndex
		}))
	};
}
