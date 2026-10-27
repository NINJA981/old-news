/** Drift list (SPEC F15): one row per changed figure, newest first, in a table that stacks on phones. */
import { X } from 'lucide-react';
import { relativeTime } from '../../engine/present';
import { GhostButton } from '../components/Button';
import { useDelayed, useDriftRows } from '../hooks';
import { Skeleton } from '../kit';
import { useApp } from './context';
import { EmptyPanel, ErrorPanel, PageHeader } from './parts';

export function Drift() {
  const { version, now, route, go } = useApp();
  const storyId = route.query.get('story');
  const res = useDriftRows(storyId ?? undefined, version);
  const slow = useDelayed(res.state === 'loading');

  return (
    <>
      <PageHeader
        title="Drift"
        actions={
          storyId ? (
            <GhostButton onClick={() => go('#/drift')}>
              <X size={14} strokeWidth={1.5} aria-hidden />
              Show all stories
            </GhostButton>
          ) : null
        }
      >
        Every number, date, name or outcome that differed from something you read, over the last 30
        days.
      </PageHeader>

      {res.state === 'error' ? (
        <ErrorPanel error={res.error} retry={res.reload} />
      ) : res.state === 'loading' ? (
        slow ? (
          <div className="space-y-2" aria-busy="true">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : null
      ) : res.data.length === 0 ? (
        <EmptyPanel title="No changed figures in the last 30 days.">
          When a number, date, name or outcome differs from something you read, it’s listed here.
        </EmptyPanel>
      ) : (
        <div className="overflow-hidden rounded-md bg-surface shadow-e1">
          <table className="block w-full border-collapse text-left md:table">
            <caption className="sr-only">Changed figures, newest first</caption>
            <thead className="hidden border-b border-border text-caption text-fg-muted md:table-header-group">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold md:w-[34%]">
                  Figure
                </th>
                <th scope="col" className="whitespace-nowrap px-4 py-3 font-semibold">
                  Earlier, then now
                </th>
                <th scope="col" className="whitespace-nowrap px-4 py-3 font-semibold">
                  Earlier source
                </th>
                <th scope="col" className="whitespace-nowrap px-4 py-3 font-semibold">
                  Now source
                </th>
                <th scope="col" className="hidden px-4 py-3 font-semibold lg:table-cell">
                  Story
                </th>
              </tr>
            </thead>
            <tbody className="block md:table-row-group">
              {res.data.map((d) => (
                <tr
                  key={d.id}
                  className="grid grid-cols-2 gap-x-4 border-b border-border px-4 py-4 last:border-0 md:table-row md:px-0 md:py-0"
                >
                  <td className="order-2 col-span-2 mt-1 text-ui text-fg-muted md:table-cell md:px-4 md:py-3">
                    <span className="sr-only md:hidden">Figure: </span>
                    {d.context || 'Changed detail'}
                  </td>
                  <td className="order-1 col-span-2 text-ui-strong text-drift tnum md:table-cell md:whitespace-nowrap md:px-4 md:py-3">
                    {d.before || 'not mentioned'} → {d.after || 'not mentioned'}
                  </td>
                  <td className="order-3 mt-3 text-caption text-fg md:table-cell md:whitespace-nowrap md:px-4 md:py-3">
                    <span className="block text-fg-muted md:hidden">Earlier</span>
                    {d.oldUrl ? (
                      <a
                        href={d.oldUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline-offset-2 hover:underline"
                      >
                        {d.oldSite}
                      </a>
                    ) : (
                      d.oldSite
                    )}
                    <span className="block text-fg-muted tnum">{relativeTime(d.oldAt, now)}</span>
                  </td>
                  <td className="order-3 mt-3 text-caption text-fg md:table-cell md:whitespace-nowrap md:px-4 md:py-3">
                    <span className="block text-fg-muted md:hidden">Now</span>
                    {d.newUrl ? (
                      <a
                        href={d.newUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline-offset-2 hover:underline"
                      >
                        {d.newSite}
                      </a>
                    ) : (
                      d.newSite
                    )}
                    <span className="block text-fg-muted tnum">{relativeTime(d.newAt, now)}</span>
                  </td>
                  <td className="hidden py-3 pr-4 text-caption text-fg-muted lg:table-cell">
                    {d.storyId ? (
                      <a
                        href={`#/stories?story=${encodeURIComponent(d.storyId)}`}
                        className="line-clamp-2 underline-offset-2 hover:underline"
                      >
                        {d.storyLabel ?? 'Story'}
                      </a>
                    ) : (
                      'No story'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
