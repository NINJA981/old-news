/**
 * The overlay stylesheet (closed Shadow DOM). Every value is a DESIGN.md token: the palette comes
 * from tokens.ts, sizes follow the 4 px grid and the 4 / 8 / 12 / 16 radius grammar. Only opacity
 * and transform animate (plus the tray's grid rows). Type is px, so the host page's root font size
 * can never change it.
 */
import type { OverlayPalette } from './tokens';

export function overlayCss(p: Readonly<OverlayPalette>): string {
  return `
:host{all:initial}
*,*::before,*::after{box-sizing:border-box}
.root{--surface:${p.surface};--surface-2:${p.surface2};--border:${p.border};--border-strong:${p.borderStrong};
--text:${p.text};--text-muted:${p.textMuted};--text-subtle:${p.textSubtle};--accent:${p.accent};--on-accent:${p.onAccent};
--drift:${p.drift};--drift-soft:${p.driftSoft};--danger:${p.danger};--drift-mark:${p.driftMark};--shadow:${p.shadow};
--ui:'ON Hanken','Hanken Grotesk Variable',ui-sans-serif,system-ui,sans-serif;
--read:'ON Newsreader','Newsreader Variable','Iowan Old Style',Georgia,serif;
--ease:cubic-bezier(.23,1,.32,1);
position:absolute;left:0;top:0;width:0;height:0;overflow:visible;color:var(--text);
font:450 12px/16px var(--ui);letter-spacing:.005em;text-align:left;font-synthesis:none;-webkit-font-smoothing:antialiased;text-transform:none}
.layer{position:absolute;left:0;top:0;width:0;height:0;pointer-events:none}
button,a{font:inherit;letter-spacing:inherit;color:inherit;margin:0;text-decoration:none}
button{cursor:pointer;background:none;border:0;padding:0;text-align:left}
button:focus-visible,a:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
[hidden]{display:none !important}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}

.tag{position:absolute;z-index:1;display:block;height:20px;max-width:280px;padding:2px 6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
border-radius:4px;background:color-mix(in srgb,var(--surface) 96%,transparent);box-shadow:0 0 0 1px var(--border);
color:var(--text-muted);font:500 11px/16px var(--ui);letter-spacing:.01em;font-variant-numeric:tabular-nums;pointer-events:auto;opacity:0;
transition:color 100ms var(--ease),opacity 100ms var(--ease)}
.tag:hover{color:var(--text)}
.tag.on{opacity:1}
.tag.off{pointer-events:none}
.dot{position:absolute;z-index:1;width:8px;height:8px;border-radius:9999px;background:var(--border-strong);pointer-events:auto;opacity:0}
.dot.on{opacity:1}
.dot::after{content:'';position:absolute;inset:-8px}
.rule{position:absolute;width:1px;background:var(--border-strong);pointer-events:none}

.pulse{position:absolute;border-radius:4px;background:var(--drift-mark);opacity:0;pointer-events:none}
.chip{position:absolute;z-index:2;display:flex;align-items:baseline;gap:4px;max-width:360px;height:20px;padding:2px 8px;border-radius:4px;
background:var(--drift-soft);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--drift) 35%,transparent);
color:color-mix(in srgb,var(--text) 90%,transparent);font:450 12px/16px var(--ui);white-space:nowrap;pointer-events:auto;opacity:0;
transition:box-shadow 100ms var(--ease)}
.chip.on{opacity:1}
.chip:hover,.chip:focus-visible{box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--drift) 35%,transparent),var(--shadow)}
.chip b{flex:none;font-weight:600;color:var(--drift);font-variant-numeric:tabular-nums}
.chip span{min-width:0;overflow:hidden;text-overflow:ellipsis}
.more{position:absolute;display:block;height:20px;padding:2px 6px;border-radius:4px;color:var(--text-muted);font:600 12px/16px var(--ui);pointer-events:none;opacity:0}
.more.on{opacity:1}
.chip[data-mode=hover],.more[data-mode=hover]{transition:opacity 100ms var(--ease),box-shadow 100ms var(--ease)}
.chip[data-mode=hover].on:not(.show):not(:focus-visible):not(:hover),.more[data-mode=hover]:not(.show){opacity:0}
.chip[data-mode=hover]{box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--drift) 35%,transparent),var(--shadow)}
.tag.under,.dot.under,.chip.under,.more.under{opacity:0 !important;pointer-events:none}

.marker{position:absolute;width:2px;background:var(--accent);pointer-events:none}
.fold{position:absolute;display:block;height:24px;background:none;pointer-events:auto}
.fold span{position:absolute;left:0;top:50%;transform:translateY(-50%);padding:2px 6px;border-radius:4px;background:var(--surface);
box-shadow:0 0 0 1px var(--border);color:var(--text-muted);font:450 12px/16px var(--ui);opacity:0;transition:opacity 100ms var(--ease)}
.fold:hover span,.fold:focus-visible span{opacity:1}

.card{position:absolute;z-index:4;width:320px;padding:16px;border-radius:12px;background:var(--surface);box-shadow:var(--shadow);pointer-events:auto;
opacity:0;visibility:hidden;transform:scale(.96);transition:opacity 120ms var(--ease),transform 120ms var(--ease),visibility 0s 120ms}
.card.open{opacity:1;visibility:visible;transform:none;transition:opacity 160ms var(--ease),transform 160ms var(--ease)}
.c-head{display:flex;justify-content:space-between;gap:8px;font:600 12px/16px var(--ui)}
.c-head span{font-weight:450;color:var(--text-muted);text-align:right}
.c-title{margin:8px 0 0;font:500 15px/20px var(--read);letter-spacing:-.005em;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.c-snip{margin:8px 0 0;font:400 14px/22px var(--read);color:var(--text-muted)}
.c-match{margin:8px 0 0;color:var(--text-muted)}
.c-actions{display:flex;flex-wrap:wrap;gap:4px;margin:12px -8px -8px}
.btn{display:inline-flex;align-items:center;gap:6px;height:32px;padding:6px 10px;border-radius:8px;color:var(--text-muted);font:450 13px/20px var(--ui);
letter-spacing:0;cursor:pointer;transition:background-color 100ms var(--ease),color 100ms var(--ease)}
.btn:hover{background:var(--surface-2);color:var(--text)}
.btn:active{transform:scale(.97)}
.btn.swap{animation:swap 150ms var(--ease)}
@keyframes swap{from{opacity:0}to{opacity:1}}

.pill{position:fixed;z-index:6;right:16px;bottom:16px;display:flex;flex-wrap:wrap;align-items:center;column-gap:8px;min-height:36px;
max-width:min(520px,calc(100vw - 32px));padding:0 6px 0 12px;border-radius:18px;background:var(--surface);box-shadow:var(--shadow);
font:450 13px/20px var(--ui);letter-spacing:0;color:var(--text);pointer-events:auto;opacity:0;transform:translateY(8px)}
.pill.on{opacity:1;transform:none}
.pill[hidden]{display:none}
.pill .mark{display:flex;color:var(--text)}
.pill .mark.busy{animation:shimmer 1s ease-in-out infinite}
@keyframes shimmer{50%{opacity:.4}}
.pill .txt{padding:8px 0;min-width:0;font-variant-numeric:tabular-nums}
.pill b{font-weight:600}
.pill .only{transition:opacity 150ms var(--ease)}
.pill .only.off{opacity:0}
.pill .x,.pill .retry{display:flex;align-items:center;justify-content:center;border-radius:8px;color:var(--text-muted);
transition:background-color 100ms var(--ease),color 100ms var(--ease)}
.pill .x{width:24px;height:24px;margin-left:auto;flex:none}
.pill .retry{height:24px;padding:0 8px;font-weight:600;color:var(--text)}
.pill .x:hover,.pill .retry:hover{background:var(--surface-2);color:var(--text)}
.pill .err{display:flex;color:var(--danger)}
.pill .sub{flex-basis:100%;margin:-6px 0 8px 24px;color:var(--text-muted);font:450 12px/16px var(--ui)}
.pill .keys{flex-basis:100%;display:none;align-items:center;gap:8px;margin:-2px 0 8px 24px;color:var(--text-muted);font:450 12px/16px var(--ui)}
.pill:hover .keys,.pill:focus-within .keys{display:flex}
kbd{display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:20px;padding:0 5px;border-radius:4px;background:var(--surface-2);
box-shadow:0 0 0 1px var(--border),inset 0 -1px 0 var(--border);color:var(--text-muted);font:500 11px/16px var(--ui);letter-spacing:.01em}

.tray{position:fixed;z-index:6;right:16px;bottom:60px;width:340px;max-width:calc(100vw - 32px);border-radius:4px;background:var(--surface);
box-shadow:var(--shadow);pointer-events:auto;overflow:hidden}
.tray.open{border-radius:16px}
.tray[hidden]{display:none}
.t-head{display:flex;align-items:center;gap:6px;width:100%;padding:4px 8px;color:var(--text);font:450 12px/16px var(--ui)}
.tray.open .t-head{padding:12px 16px 4px;font-weight:600}
.t-head svg{flex:none;transition:transform 250ms var(--ease)}
.tray.open .t-head svg{transform:rotate(180deg)}
.t-wrap{display:grid;grid-template-rows:0fr;transition:grid-template-rows 250ms var(--ease)}
.tray.open .t-wrap{grid-template-rows:1fr}
.t-body{min-height:0;overflow:hidden}
.t-in{padding:8px 16px 16px;max-height:min(60vh,420px);overflow:auto}
.t-row{display:block;padding:8px 0;border-top:1px solid var(--border)}
.t-row:first-child{border-top:0}
.t-row:hover .t-title{text-decoration:underline}
.t-site{font:600 12px/16px var(--ui)}
.t-site span{font-weight:450;color:var(--text-muted)}
.t-title{margin-top:2px;font:500 15px/20px var(--read)}
.t-h{margin:12px 0 4px;font:600 12px/16px var(--ui);color:var(--text-muted)}
.t-chg{display:flex;justify-content:space-between;gap:12px;padding:4px 0;font:450 13px/20px var(--ui)}
.t-chg b{flex:none;color:var(--drift);font-weight:600;font-variant-numeric:tabular-nums}
.t-foot{display:flex;gap:4px;margin:12px -8px -8px}

@media (max-width:480px){.tray{left:16px;width:auto;max-width:none}}
@media (prefers-reduced-motion:reduce){
.pill .mark.busy,.btn.swap{animation:none}
.card,.card.open,.t-wrap,.t-head svg,.tag,.chip,.btn,.fold span,.pill .only{transition-duration:.01ms !important}
}
`;
}

/** The page-level highlight rule for `CSS.highlights` (a document stylesheet, outside the shadow root). */
export function highlightCss(p: Readonly<OverlayPalette>): string {
  return `::highlight(on-drift){background-color:${p.driftMark};text-decoration:underline;text-decoration-thickness:${p.driftLine.width};text-decoration-color:color-mix(in srgb,${p.drift} ${p.driftLine.mix},transparent);text-underline-offset:2px}`;
}
