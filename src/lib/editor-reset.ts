import type { PP3 } from './pp3-utils';
import type { EditorTool } from './editor-tools';
const chapters: Record<Exclude<EditorTool, 'adjustments'>, string[]> = {
	crop: ['Crop', 'Rotation', 'Perspective'],
	retouch: ['Spot_removal'],
	masks: ['Locallab']
};

/** Reset only the active tool, preserving settings belonging to other pages. */
export function resetEditorTool(current: PP3, baseline: PP3, tool: EditorTool, neutral: PP3): PP3 {
	const result = structuredClone(tool === 'adjustments' ? baseline : current);
	const keys = tool === 'adjustments' ? Object.values(chapters).flat() : chapters[tool];
	const source = tool === 'adjustments' ? current : neutral;
	for (const key of keys) {
		if (source[key]) result[key] = structuredClone(source[key]);
		else delete result[key];
	}
	if (tool === 'masks') result.Locallab = { Enabled: false, Selspot: 0 };
	return result;
}
