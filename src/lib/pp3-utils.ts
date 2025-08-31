
export type PP3<T = string | number | boolean> = Record<string, Record<string, T>>;

export function parsePP3(pp3: string) {
    const lines = pp3.split('\n');
    const result: PP3 = {};

    let currentChapter = '';
    for (const line of lines) {
        const trimmedLine = line.trim();
        if (trimmedLine === '' || trimmedLine.startsWith('#')) {
            continue; // Skip empty lines and comments
        }

        // is chapter ex. [chapter 1]
        if (trimmedLine.startsWith('[') && trimmedLine.endsWith(']')) {
            const chapterName = trimmedLine.slice(1, -1).trim().replace(/\s+/g, '_');
            result[chapterName] = {};
            currentChapter = chapterName;
            continue;
        }

        const chapterObject = result[currentChapter];
        const [key, value] = trimmedLine.split('=');
        if (!key || !value) {
            continue; // Skip lines that do not have a key-value pair
        }

        const cleanKey = key.trim();
        const cleanValue = value.trim();

        if (!cleanKey || !cleanValue) {
            continue; // Skip if either key or value is empty after trimming
        }

        // Initialize the chapter object if it doesn't exist
        if (!chapterObject) {
            result[currentChapter] = {};
        }

        // try to parse values as numbers or booleans
        const float = parseFloat(cleanValue);
        if (!isNaN(float)) {
            // If the value is a number, convert it to a number
            chapterObject[cleanKey] = float;
        } else if (cleanValue.toLowerCase() === 'true' || cleanValue.toLowerCase() === 'false') {
            // If the value is a boolean, convert it to a boolean
            chapterObject[cleanKey] = cleanValue.toLowerCase() === 'true';
        } else {
            // Otherwise, keep it as a string
            chapterObject[cleanKey] = cleanValue;
        }
    }

    return result;
}

export function stringifyPP3(pp3Object: PP3) {
    let result = '';
    for (const chapter in pp3Object) {
        result += `[${chapter.replace(/_/g, ' ')}]\n`;
        for (const key in pp3Object[chapter]) {
            const value = pp3Object[chapter][key];
            if (typeof value === 'boolean') {
                result += `${key}=${value ? 'true' : 'false'}\n`;
            } else if (typeof value === 'number') {
                result += `${key}=${value.toFixed(3).replace(/\.0+$/, '')}\n`;
            } else {
                result += `${key}=${value}\n`;
            }
        }
        result += '\n'; // Add a newline after each chapter
    }
    return result.trim(); // Remove trailing newline
}

export function applyPP3Diff(pp3: PP3, diff: PP3) {
    for (const chapter in diff) {
        if (!pp3[chapter]) {
            pp3[chapter] = {};
        }
        for (const key in diff[chapter]) {
            pp3[chapter][key] = diff[chapter][key];
        }
    }

    return pp3;
}

export function diffPP3(base: PP3, target: PP3): PP3 {
    const diff: PP3 = {};
    for (const chapter in target) {
        if (!base[chapter]) {
            diff[chapter] = target[chapter];
            continue;
        }
        for (const key in target[chapter]) {
            if (base[chapter][key] != target[chapter][key]) {
                if (!diff[chapter]) {
                    diff[chapter] = {};
                }
                diff[chapter][key] = target[chapter][key];
            }
        }
    }
    return diff;
}

export function countPP3Properties(pp3: PP3): number {
    let count = 0;
    for (const chapter in pp3) {
        count += Object.keys(pp3[chapter]).length;
    }
    return count;
}

export function filterPP3(pp3: PP3, chapters: string[]) {
    const filtered: PP3 = {};
    for (const chapter of chapters) {
        if (pp3[chapter]) {
            filtered[chapter] = pp3[chapter];
        }
    }
    return filtered;
}

export function excludePP3(pp3: PP3, chapters: string[]) {
    const filtered: PP3 = {};
    for (const chapter in pp3) {
        if (!chapters.includes(chapter)) {
            filtered[chapter] = pp3[chapter];
        }
    }
    return filtered;
}

export function toBase64(pp3: PP3) {
    const pp3String = stringifyPP3(pp3);
    return btoa(unescape(encodeURIComponent(pp3String)));
}

export function fromBase64(base64: string) {
    return decodeURIComponent(escape(atob(base64)));
}

export function setLut(pp3: any, lutPath: string) {
    pp3.Film_Simulation = {
        Enabled: true,
        ClutFilename: lutPath,
        Strength: 100
    };

    return pp3;
}