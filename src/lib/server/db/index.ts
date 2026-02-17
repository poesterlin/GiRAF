import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { building } from '$app/environment';
import { env } from '$env/dynamic/private';
import postgres from 'postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

let _db: PostgresJsDatabase<any>;

async function createDb() {
    if (!env.DATABASE_URL && !building) {
        throw new Error('DATABASE_URL is not set');
    }

    let schema = undefined;

    if (!building) {
        schema = await import('./schema');
    }

    const client = postgres(env.DATABASE_URL!);
    _db = drizzle({ client, logger: false, schema });

    if (!building) {
        console.log('Migrating database...');
        await migrate(_db, { migrationsFolder: 'drizzle' });
        console.log('Database migrated');
    }

    return _db;
}

await createDb();

export { _db as db };
