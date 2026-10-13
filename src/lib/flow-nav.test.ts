import { describe, expect, test } from 'bun:test';
import { flowNavState } from './flow-nav';

describe('flow navigation', () => {
	test('top level pages highlight the matching link', () => {
		expect(flowNavState({ pathname: '/importer', triageEnabled: true }).activePage).toBe('import');
		expect(flowNavState({ pathname: '/gallery', triageEnabled: true }).activePage).toBe('gallery');
		expect(flowNavState({ pathname: '/exporter/46', triageEnabled: true }).activePage).toBe('export');
		expect(flowNavState({ pathname: '/', triageEnabled: true }).activePage).toBeNull();
		expect(flowNavState({ pathname: '/settings', triageEnabled: true }).activePage).toBeNull();
	});

	test('photo routes are session stages, hubs are not', () => {
		const triage = flowNavState({ pathname: '/triage/1816', triageEnabled: true, sessionName: 'Türkei' });
		expect(triage.sessionStage).toBe('triage');
		expect(triage.stageLabel).toBe('Triage');
		expect(triage.sessionName).toBe('Türkei');

		for (const pathname of ['/editor/1816', '/editor/1816/crop', '/editor/1816/masks', '/editor/1816/retouch']) {
			const editor = flowNavState({ pathname, triageEnabled: true, sessionName: 'Türkei' });
			expect(editor.sessionStage).toBe('editor');
			expect(editor.stageLabel).toBe('Editor');
			expect(editor.activePage).toBeNull();
		}

		expect(flowNavState({ pathname: '/editor', triageEnabled: true }).sessionStage).toBeNull();
		expect(flowNavState({ pathname: '/triage', triageEnabled: true }).sessionStage).toBeNull();
	});

	test('session context is only shown inside a session', () => {
		expect(flowNavState({ pathname: '/gallery', triageEnabled: true, sessionName: 'Türkei' }).sessionName).toBeNull();
		expect(flowNavState({ pathname: '/editor/1816', triageEnabled: true }).sessionName).toBeNull();
	});

	test('stage dots mark progress through the session stages', () => {
		const triage = flowNavState({ pathname: '/triage/1816', triageEnabled: true });
		expect(triage.stageSteps.map((step) => [step.key, step.active, step.done])).toEqual([
			['triage', true, false],
			['editor', false, false]
		]);

		const editor = flowNavState({ pathname: '/editor/1816', triageEnabled: true });
		expect(editor.stageSteps.map((step) => [step.key, step.active, step.done])).toEqual([
			['triage', false, true],
			['editor', true, false]
		]);
	});

	test('disabling triage leaves the editor as the only session stage', () => {
		const nav = flowNavState({ pathname: '/triage/1816', triageEnabled: false });
		expect(nav.sessionStage).toBeNull();
		expect(nav.stageSteps.map((step) => step.key)).toEqual(['editor']);
		expect(flowNavState({ pathname: '/editor/1816', triageEnabled: false }).stageSteps).toEqual([{ key: 'editor', label: 'Editor', done: false, active: true }]);
	});

	test('unrelated paths never match a page or stage', () => {
		for (const pathname of ['/editorface', '/gallery-old', '/importerx', '/']) {
			const nav = flowNavState({ pathname, triageEnabled: true, sessionName: 'Türkei' });
			expect(nav.activePage).toBeNull();
			expect(nav.sessionStage).toBeNull();
			expect(nav.stageLabel).toBeNull();
			expect(nav.stageSteps.every((step) => !step.active)).toBe(true);
		}
	});
});
