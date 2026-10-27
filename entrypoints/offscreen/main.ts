/**
 * Chrome offscreen document: hosts the engine (index, guard, tiers, IndexedDB, embedder).
 * The background creates it on the first article and closes it after 5 min idle.
 */
import { startExtensionEngine } from '../../src/adapters/extensionEngine';

void startExtensionEngine();
