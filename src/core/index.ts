/**
 * The engine's single entry module. The extension (offscreen document, Firefox background page,
 * popup, app) and the phone-friendly web app in site/ both import from here.
 *
 * Rules for everything re-exported:
 *  - no chrome.* / browser.* / extension-only APIs (those live in src/adapters and entrypoints/);
 *  - browser-API access goes through small injected adapters: an `Embedder`, a `SettingsStore`,
 *    an IndexedDB `Db`, and the message transport.
 */

// Matching engine (pure).
export * from '../engine/embedder';
export * from '../engine/facts';
export * from '../engine/fakeEmbedder';
export * from '../engine/guard';
export * from '../engine/hash';
export * from '../engine/lsh';
export * from '../engine/match';
export * from '../engine/memoryIndex';
export * from '../engine/minhash';
export * from '../engine/normalize';
export * from '../engine/present';
export * from '../engine/quantize';
export * from '../engine/receipt';
export * from '../engine/shingle';
export * from '../engine/story';
export * from '../engine/thresholds';
export * from '../engine/tiers';
export * from '../engine/types';
export * from '../engine/url';

// Page pipeline (takes a Document; works with a real page, jsdom or linkedom).
export * from '../extract';
export * from '../extract/english';
export * from '../extract/signals';

// Painting maths (pure).
export * from '../paint/contrastFloor';

// Storage and the host (IndexedDB only; the Db is injected).
export * from '../host/engineHost';
export * from '../host/handle';
export * from '../store/db';
export * from '../store/repo';
export * from '../store/ttl';
export * from '../store/wipe';

// Protocol and settings.
export * from '../messaging/protocol';
export * from './engine';
export * from './page';
export * from './settings';

// Embedding adapters (the transformers.js import is lazy, so the engine stays light).
export * from '../embed/backend';
export * from '../embed/lazyEmbedder';
export * from '../embed/transformersEmbedder';
export * from '../net/localAsset';
