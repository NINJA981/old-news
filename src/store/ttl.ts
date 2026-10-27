/** TTL sweep (SPEC F17, AC17.1): deletes every record whose expiresAt is in the past, in all stores. */
import type { Db, ExpiringStore } from './db';
import { EXPIRING_STORES } from './db';
import { setMeta } from './repo';

export type SweepReport = Record<ExpiringStore, number>;

export async function sweepExpired(db: Db, now: number): Promise<SweepReport> {
  const report = Object.fromEntries(EXPIRING_STORES.map((s) => [s, 0])) as SweepReport;
  const tx = db.transaction([...EXPIRING_STORES], 'readwrite');
  await Promise.all(
    EXPIRING_STORES.map(async (name) => {
      const index = tx.objectStore(name).index('expiresAt');
      let cursor = await index.openCursor(IDBKeyRange.upperBound(now));
      while (cursor) {
        await cursor.delete();
        report[name]++;
        cursor = await cursor.continue();
      }
    }),
  );
  await tx.done;
  await setMeta(db, 'lastSweepAt', now);
  return report;
}
