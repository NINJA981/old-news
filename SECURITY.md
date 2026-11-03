# Security policy

Old News reads the articles you open and keeps a memory of them on your machine, so a security bug
here is a privacy bug. Reports are welcome and taken seriously.

## Supported versions

| Version | Supported |
|---|---|
| 0.1.x | yes |

## Report a vulnerability

Please **do not open a public issue**. Use GitHub's private reporting instead: the repository's
**Security** tab, then **Report a vulnerability**. Only the maintainer can read it.

Include the browser and version, the Old News version (`chrome://extensions` shows it), what you
did, and what happened. A fictionalised copy of the page markup helps more than a link to a real
site.

You will get a reply within 7 days. A fix for a confirmed issue is released as soon as it is ready,
and the report is credited in `CHANGELOG.md` unless you ask otherwise.

## What counts

In scope, for example:

- Any network request made by the extension at runtime (the design allows none).
- A web page reading or changing Old News memory, settings or the overlay's shadow root.
- A page's script crossing into the extension through messaging (`src/messaging/protocol.ts` checks
  senders and validates every message).
- Full paragraph text being stored (only 140-character snippets, hashes and vectors should be).
- Old News running in an incognito window, or on a site the reader paused.

Out of scope: a page that fails to line up its paragraphs (that is a normal bug, open an issue), and
anything that needs an attacker to already control your browser profile.

## How the design limits damage

- Extension pages carry `connect-src 'self'` in their Content Security Policy.
- The manifest has no required host permissions. Site access is optional and asked for on the
  onboarding page.
- The overlay runs in a closed shadow root and never removes page elements.
- Memory expires after 30 days, and **Forget everything** in Settings clears every store.
