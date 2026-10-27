/** Onboarding: placeholder for Stage 3. Explains the permission honestly and requests site access. */
import { useState } from 'react';
import { browser } from 'wxt/browser';
import { mount } from '../../src/ui/boot';
import { PrimaryButton } from '../../src/ui/components/Button';

type Access = 'idle' | 'granted' | 'denied';

function Onboarding() {
  const [access, setAccess] = useState<Access>('idle');

  async function allow() {
    const granted = await browser.permissions.request({ origins: ['https://*/*', 'http://*/*'] });
    setAccess(granted ? 'granted' : 'denied');
  }

  return (
    <main className="mx-auto max-w-[560px] px-6 py-12 text-fg">
      <h1 className="font-read text-h1">Old News remembers what you have read.</h1>
      <p className="mt-4 text-lead text-fg-muted">
        It fades the paragraphs you already know and lights up what is new. Everything stays on this
        computer, and it sends nothing anywhere.
      </p>
      <p className="mt-4 text-body text-fg-muted">
        To work while you read, it needs permission to run on the pages you open. It only acts on
        English articles, never in private windows.
      </p>
      <div className="mt-6">
        {access === 'granted' ? (
          <p className="text-ui-strong text-success">Allowed. Open an article to see it work.</p>
        ) : (
          <PrimaryButton onClick={() => void allow()}>Allow on websites</PrimaryButton>
        )}
        {access === 'denied' ? (
          <p className="mt-3 text-ui text-fg-muted">
            No access was granted, so Old News cannot read pages yet. You can allow it from this
            page at any time.
          </p>
        ) : null}
      </div>
    </main>
  );
}

mount(<Onboarding />);
