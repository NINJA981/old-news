/**
 * A static paper sheet that shows what Old News does, on fixture text (invented outlets). Used on
 * onboarding. The faded paragraph is set at the exact opacity the real solver gives for this ink
 * and paper, so the picture is as honest as the product.
 */
import { solveFade } from '../paint/contrastFloor';

const INK = { r: 30, g: 26, b: 22, a: 1 }; // paper-sheet text #1e1a16
const PAPER = { r: 254, g: 253, b: 252, a: 1 }; // paper-sheet surface #fefdfc

export function SampleSheet() {
  const alpha = solveFade(INK, PAPER, 'seen').opacity;
  return (
    <figure className="m-0">
      <div className="paper relative rounded-lg p-6 shadow-e1">
        <div className="font-read text-read-snippet text-fg">
          <p className="relative pr-0" style={{ opacity: alpha }}>
            At least 40 firefighters were sent to the scene from Port Alder and three neighbouring
            towns, and the blaze took 6 hours to bring under control.
          </p>
          <span className="mt-1 mb-4 inline-block rounded-xs border border-border bg-surface px-1.5 font-ui text-micro text-fg-muted">
            Fenwick Wire · 6 min ago
          </span>
          <p className="relative mt-2">
            <span className="mt-0 mb-1 block">
              <span className="inline-block rounded-xs bg-drift-soft px-2 py-0.5 font-ui text-caption text-fg shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--drift)_35%,transparent)]">
                <b className="font-semibold text-drift tnum">Twelve → 14</b> · Fenwick Wire said
                Twelve, 14 min ago
              </span>
            </span>
            <mark className="rounded-[2px] bg-[var(--drift-mark)] px-0.5 text-inherit underline decoration-[color:var(--drift)] decoration-1 underline-offset-2 [text-decoration-color:color-mix(in_srgb,var(--drift)_60%,transparent)]">
              14
            </mark>{' '}
            people were treated for smoke inhalation after the fire at the Port Alder warehouse,
            officials said.
          </p>
        </div>
      </div>
      <figcaption className="mt-2 text-caption text-fg-muted">
        Fixture story with invented outlets. The old paragraph fades and names its source. The one
        whose figure changed stays lit.
      </figcaption>
    </figure>
  );
}
