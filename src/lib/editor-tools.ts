export type EditorTool = 'adjustments' | 'crop' | 'retouch' | 'masks';

export const editorTools = [
	{ tool: 'masks', label: 'Masks' },
	{ tool: 'retouch', label: 'Retouch' },
	{ tool: 'crop', label: 'Crop' }
] as const;

export function editorToolFromPath(path: string): EditorTool {
	return (path.match(/^\/editor\/\d+\/(crop|retouch|masks)\/?$/)?.[1] as EditorTool | undefined) ?? 'adjustments';
}

export function editorToolUrl(imageId: string | number, tool: EditorTool, query = ''): string {
	return `/editor/${imageId}${tool === 'adjustments' ? '' : `/${tool}`}${query}`;
}
