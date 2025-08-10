
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
        if (!isNaN(parseFloat(cleanValue))) {
            // If the value is a number, convert it to a number
            chapterObject[cleanKey] = parseFloat(cleanValue);
        } else if (cleanValue.toLowerCase() === 'true' || cleanValue.toLowerCase() === 'false') {
            // If the value is a boolean, convert it to a boolean
            chapterObject[cleanKey] = cleanValue.toLowerCase() === 'true';
        } else {
            // Otherwise, keep it as a string
            chapterObject[cleanKey] = cleanValue;
        }

        // Store the value in the object under the key
        chapterObject[cleanKey] = cleanValue;
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
                result += `${key}=${Math.floor(value)}\n`;
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