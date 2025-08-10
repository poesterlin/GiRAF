import { parsePP3, type PP3 } from "./pp3-utils";
import { throttle } from "$lib";

class EditingState {
    public pp3 = $state<PP3>({});
    public throttledPP3 = $state<PP3>({});
    public updateThrottledPP3 = throttle((pp3) => {
        this.throttledPP3 = pp3;
    }, 300);

    initialize(pp3: string | PP3) {
        if (typeof pp3 === "string") {
            this.pp3 = parsePP3(pp3);
            console.log("PP3 initialized from string:", $state.snapshot(this.pp3));
        } else {
            this.pp3 = pp3;
        }

        this.throttledPP3 = $state.snapshot(this.pp3);
    }

}

export const edits = new EditingState();