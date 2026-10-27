/** "Forget everything" (SPEC F17, AC17.2): every store ends with zero records. */
import type { Db } from './db';
import { ALL_STORES } from './db';
import { storeCounts } from './repo';

/** Clears every store in one transaction. Returns how many records each store held. */
export async function wipeAll(db: Db): Promise<Record<string, number>> {
  const before = await storeCounts(db);
  const tx = db.transaction([...ALL_STORES], 'readwrite');
  await Promise.all([...ALL_STORES.map((s) => tx.objectStore(s).clear()), tx.done]);
  return before;
}
