import { assert, throttle } from '$lib';
import { parsePP3, type PP3 } from '$lib/pp3-utils';
import type { Image } from '$lib/server/db/schema';

class EditingState {
	public pp3 = $state<PP3>() as PP3;
	public throttledPP3 = $state<PP3>({});
	public updateThrottledPP3 = throttle((pp3) => (this.throttledPP3 = pp3), 300);
	public isLoading = $state(false);
	public isFaulty = $state(false);

	private history = $state<PP3[]>([]);
	private historyIndex = $state(0);

	initialize(pp3: string | PP3, image: Image) {
		assert(image, 'Image must be provided to initialize editing state');
		
		const newPp3 = typeof pp3 === 'string' ? parsePP3(pp3) : pp3;
		setDefault(newPp3.White_Balance, "Temperature", image.whiteBalance);
		setDefault(newPp3.White_Balance, "Green", image.tint);

		this.pp3 = newPp3;
		this.throttledPP3 = newPp3;
		this.history = [newPp3];
		this.historyIndex = 0;
	}

	update(newPp3: PP3) {
		// If we undo and then make a change, we want to clear the future history
		const newHistory = this.history.slice(0, this.historyIndex + 1);
		newHistory.push(newPp3);
		this.history = newHistory;
		this.historyIndex = this.history.length - 1;
	}

	undo() {
		if (this.canUndo) {
			this.historyIndex--;
			this.pp3 = this.history[this.historyIndex];
		}
	}

	redo() {
		if (this.canRedo) {
			this.historyIndex++;
			this.pp3 = this.history[this.historyIndex];
		}
	}

	get canUndo() {
		return this.historyIndex > 0;
	}

	get canRedo() {
		return this.historyIndex < this.history.length - 1;
	}
}

export const edits = new EditingState();

function setDefault(section: PP3[keyof PP3], key: string, value: any) {
	if (key !in section){
		section[key] = value;
		return;
	}

	if (section[key] === undefined && value) {
		section[key] = value;
	}
}