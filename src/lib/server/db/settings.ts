import { db } from './index';
import { settingTable } from './schema';
import { eq } from 'drizzle-orm';

export async function getSetting(key: string, defaultValue: string): Promise<string> {
	const result = await db.select().from(settingTable).where(eq(settingTable.key, key)).limit(1);
	if (result.length === 0) {
		return defaultValue;
	}
	return result[0].value;
}

export async function getBooleanSetting(key: string, defaultValue: boolean): Promise<boolean> {
	const value = await getSetting(key, defaultValue ? 'true' : 'false');
	return value === 'true';
}

export async function setSetting(key: string, value: string) {
	await db.insert(settingTable).values({ key, value }).onConflictDoUpdate({
		target: settingTable.key,
		set: { value }
	});
}

export async function getAllSettings() {
	const all = await db.select().from(settingTable);
	return all.reduce(
		(acc, curr) => {
			acc[curr.key] = curr.value;
			return acc;
		},
		{} as Record<string, string>
	);
}
