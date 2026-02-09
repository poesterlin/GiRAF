import { drizzle } from 'drizzle-orm/postgres-js';
import { building } from '$app/environment';
import { env } from '$env/dynamic/private';
import * as schema from './schema';

import { SQL } from 'bun';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

if (!env.DATABASE_URL && !building) {
    throw new Error('DATABASE_URL is not set');
}

const client = new SQL(env.DATABASE_URL) as any;
client.options = {
    parsers: {},
    serializers: {}
};

export const db = drizzle({ client, logger: false, schema });

let isMigrated = false;

if (!building && !isMigrated) {
    console.log('Migrating database...');
    await migrate(db, { migrationsFolder: 'drizzle' });
    console.log('Database migrated');
    isMigrated = true;
}
