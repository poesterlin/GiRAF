import { drizzle } from 'drizzle-orm/postgres-js';
import { building } from '$app/environment';
import { env } from '$env/dynamic/private';
import * as schema from './schema';
import postgres from 'postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

function createDb() {
    if (!env.DATABASE_URL && !building) {
        throw new Error('DATABASE_URL is not set');
    }
    
    const client = postgres(env.DATABASE_URL);
    drizzle(client, { schema });

    return drizzle({ client, logger: false, schema });
}

export const db = createDb();

if (!building) {
    console.log('Migrating database...');
    await migrate(db, { migrationsFolder: 'drizzle' });
    console.log('Database migrated');
}
