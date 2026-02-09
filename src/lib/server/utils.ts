import { type SQL, sql, type GetColumnData } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";

export async function respondWithFile(filePath: string, ageSeconds = 31536000) {
    const file = Bun.file(filePath);
    const exists = await file.exists();
    if (!exists) {
        return new Response('File not found', { status: 404 });
    }

    return new Response(file, {
        headers: {
            'Content-Type': file.type,
            'Content-Length': String(file.size),
            // caching
            'Cache-Control': `public, max-age=${ageSeconds}`
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

type SelectedType<Fields extends Record<string, PgColumn | SQL>> = {
    [Property in keyof Fields]:  Fields[Property] extends PgColumn ? GetColumnData<Fields[Property]> : Fields[Property] extends SQL<infer U> ? U : never
};

type Prettify<T> = {
    [K in keyof T]: T[K];
} & {};

export function buildJSONColumn<Fields extends Record<string, PgColumn | SQL<any>>>(fields: Fields, orderBy: PgColumn | PgColumn[] = []) {
    const order = Array.isArray(orderBy) ? orderBy : [orderBy];

    return sql<Prettify<SelectedType<Fields>>[]>`json_agg(json_build_object(
        ${sql.join(
            Object.entries(fields).map(([key, value]) => sql`${sql.raw(`'${key}'`)}, ${value}`),
            sql`, `
        )}) ${order.length ? sql`ORDER BY ${sql.join(order, sql`, `)}` : sql``})`;
}
