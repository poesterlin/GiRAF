import { throttle } from "$lib";
import { parsePP3, stringifyPP3, type PP3 } from "$lib/pp3-utils";

class EditingState {
    public pp3 = $state<PP3>({});
    public throttledPP3 = $state<PP3>({});
    public updateThrottledPP3 = throttle((pp3) => (this.throttledPP3 = pp3), 300);
    public isLoading = $state(false);
    public isFaulty = $state(false);

    private undoStack: string[] = $state([]);
    private redoStack: string[] = $state([]);

    public canUndo = $derived(this.undoStack.length > 0);
    public canRedo = $derived(this.redoStack.length > 0);

    initialize(pp3: string | PP3) {
        if (typeof pp3 === "string") {
            this.pp3 = parsePP3(pp3);
        } else {
            this.pp3 = pp3;
        }

        this.throttledPP3 = $state.snapshot(this.pp3);
    }

    store() {
        const snapshot = $state.snapshot(this.pp3);
        const stringified = stringifyPP3(snapshot);
        console.log("stored state")
    }

    undo() {
        if (!this.canUndo) {
            return;
        }

    }

    redo() {
        if (!this.canRedo) {
            return;
        }

    }

}

export const edits = new EditingState();