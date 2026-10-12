// The active tool can clear transient selection state when history changes.
export const editorHistoryKey = Symbol('editor-history');

export type EditorHistoryActions = {
	undo: () => void;
	redo: () => void;
	loading: boolean;
};
