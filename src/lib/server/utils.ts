

export function respondWithFile(filePath: string) {
    const file = Bun.file(filePath);
    return new Response(file, {
        headers: {
            'Content-Type': file.type,
            'Content-Length': String(file.size),
            // caching
            'Cache-Control': 'public, max-age=31536000'
        },
    });
}

export function getFileNameFromPath(filePath: string) {
    return filePath.split('/').pop() || '';
}

export function getFileDirectory(filePath: string) {
    const parts = filePath.split('/');
    parts.pop(); // Remove the file name
    return parts.join('/') || '/'; // Return the directory or root if empty
}

