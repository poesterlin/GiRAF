import { drizzle } from 'drizzle-orm/postgres-js';
import { building } from '$app/environment';
import { env } from '$env/dynamic/private';
import postgres from 'postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

async function createDb() {
    if (!env.DATABASE_URL) {
        throw new Error('DATABASE_URL is not set');
    }

    const schema = await import('./schema');
    const client = postgres(env.DATABASE_URL!);
    const db = drizzle({ client, logger: true, schema });
    
    if (!building){
        console.log('Migrating database...');
        await migrate(db, { migrationsFolder: 'drizzle' });
        console.log('Database migrated');
    }

    return db;
}

export const db = await createDb();
