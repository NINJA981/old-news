/**
 * Message protocol (ADR-0001 §7), validated with valibot at every boundary.
 * Unknown or malformed messages are dropped (parse returns null).
 */
import * as v from 'valibot';

const MAX_PARAGRAPHS = 600;
const MAX_TEXT = 20_000;

const Str = (max: number) => v.pipe(v.string(), v.maxLength(max));
const Int = v.pipe(v.number(), v.integer(), v.minValue(0));

export const ArticleKindSchema = v.picklist(['news', 'blog', 'liveblog']);

export const PageMetaSchema = v.object({
  url: Str(4096),
  canonicalUrl: Str(4096),
  siteName: Str(300),
  title: Str(1000),
  kind: ArticleKindSchema,
});
export type PageMeta = v.InferOutput<typeof PageMetaSchema>;

export const ParagraphInputSchema = v.object({ ordinal: Int, text: Str(MAX_TEXT) });

/** The "Previously on" card, trimmed for chrome.storage.session (popup, This story tab). */
export const StoryCardSchema = v.object({
  label: Str(300),
  articles: v.pipe(
    v.array(v.object({ siteName: Str(300), title: Str(300), url: Str(4096), readAt: v.number() })),
    v.maxLength(12),
  ),
  changed: v.pipe(
    v.array(
      v.object({
        kind: Str(20),
        before: Str(80),
        after: Str(80),
        context: Str(80),
        siteName: Str(300),
        readAt: v.number(),
      }),
    ),
    v.maxLength(12),
  ),
});
export type StoryCard = v.InferOutput<typeof StoryCardSchema>;

export const PageStatusSchema = v.variant('status', [
  v.object({ status: v.literal('not-article') }),
  v.object({ status: v.literal('non-english') }),
  v.object({ status: v.literal('paused'), scope: v.picklist(['site', 'global']) }),
  v.object({ status: v.literal('unmapped'), reason: Str(200) }),
  v.object({ status: v.literal('analysing'), total: Int }),
  v.object({
    status: v.literal('result'),
    total: Int,
    new: Int,
    seen: Int,
    similar: Int,
    changed: Int,
    degraded: v.boolean(),
    storyId: v.nullable(Str(200)),
    story: v.optional(v.nullable(StoryCardSchema)),
  }),
  v.object({ status: v.literal('error'), reason: Str(500) }),
]);
export type PageStatus = v.InferOutput<typeof PageStatusSchema>;

export const MessageSchema = v.variant('type', [
  v.object({
    type: v.literal('page/analyse'),
    page: PageMetaSchema,
    paragraphs: v.pipe(v.array(ParagraphInputSchema), v.maxLength(MAX_PARAGRAPHS)),
    /** Add to the article's session instead of replacing it (live-blog posts). */
    append: v.optional(v.boolean()),
  }),
  v.object({
    // Install-time ingest (SPEC F13): analyse and remember every mapped paragraph as read.
    type: v.literal('page/ingest'),
    page: PageMetaSchema,
    paragraphs: v.pipe(v.array(ParagraphInputSchema), v.maxLength(MAX_PARAGRAPHS)),
  }),
  // Background -> content script in an already-open tab (after scripting.executeScript).
  v.object({ type: v.literal('ingest/probe') }),
  v.object({ type: v.literal('ingest/run') }),
  v.object({
    type: v.literal('page/read'),
    canonicalUrl: Str(4096),
    ordinals: v.pipe(v.array(Int), v.maxLength(MAX_PARAGRAPHS)),
  }),
  v.object({ type: v.literal('page/status'), url: Str(4096), status: PageStatusSchema }),
  v.object({
    type: v.literal('page/feedback'),
    fingerprint: Str(100),
    oldParagraphId: Str(100),
  }),
  v.object({ type: v.literal('ingest/tabs'), tabIds: v.pipe(v.array(Int), v.maxLength(200)) }),
  // Onboarding: which open tabs look like articles (reads only already-loaded DOM, never fetches).
  v.object({ type: v.literal('ingest/candidates') }),
  v.object({ type: v.literal('settings/changed') }),
  v.object({ type: v.literal('memory/stats') }),
  v.object({ type: v.literal('memory/wipe') }),
  v.object({ type: v.literal('memory/sweep') }),
  v.object({ type: v.literal('drift/list'), storyId: v.optional(Str(200)) }),
  v.object({ type: v.literal('drift/overview'), storyId: v.optional(Str(200)) }),
  v.object({ type: v.literal('stories/overview') }),
  // Content script -> background: open the app page at a hash route (a page cannot open it itself).
  v.object({ type: v.literal('app/open'), route: Str(200) }),
  v.object({ type: v.literal('stories/list') }),
  v.object({ type: v.literal('receipt/week') }),
  v.object({ type: v.literal('font/get'), family: v.picklist(['newsreader', 'hanken']) }),
]);
export type Message = v.InferOutput<typeof MessageSchema>;
export type MessageType = Message['type'];
export type MessageOf<T extends MessageType> = Extract<Message, { type: T }>;

/** Messages the background forwards to the engine host carry this envelope. */
export const EngineEnvelopeSchema = v.object({
  target: v.literal('engine'),
  message: MessageSchema,
});
export type EngineEnvelope = v.InferOutput<typeof EngineEnvelopeSchema>;

export const ENGINE_MESSAGE_TYPES: ReadonlySet<MessageType> = new Set([
  'page/analyse',
  'page/ingest',
  'page/read',
  'page/feedback',
  'memory/stats',
  'memory/wipe',
  'memory/sweep',
  'drift/list',
  'drift/overview',
  'stories/overview',
  'stories/list',
  'receipt/week',
]);

export function parseMessage(input: unknown): Message | null {
  const r = v.safeParse(MessageSchema, input);
  return r.success ? r.output : null;
}

export function parseEngineEnvelope(input: unknown): EngineEnvelope | null {
  const r = v.safeParse(EngineEnvelopeSchema, input);
  return r.success ? r.output : null;
}

export function isEngineMessage(m: Message): boolean {
  return ENGINE_MESSAGE_TYPES.has(m.type);
}

/**
 * Messages a content script (a web page's isolated world) may send. Everything else is reserved
 * for extension pages: a compromised page context can never wipe memory or list stories.
 */
export const CONTENT_MESSAGE_TYPES: ReadonlySet<MessageType> = new Set([
  'page/analyse',
  'page/ingest',
  'page/read',
  'page/status',
  'page/feedback',
  'font/get',
  'app/open',
]);

export function isContentMessage(m: Message): boolean {
  return CONTENT_MESSAGE_TYPES.has(m.type);
}
