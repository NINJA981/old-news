import { useId, useRef, useState, type DragEvent } from 'react';
import { Icon } from './ui.tsx';

export interface ComposerProps {
  busy: boolean;
  onSubmitText: (text: string, source: string) => void;
  onFiles: (files: File[]) => void;
  /** Autofocus the textarea (empty state, desktop). */
  autoFocus?: boolean;
}

/** Paste box, optional source name, and a file picker. Dropping anywhere on the page also works. */
export function Composer({ busy, onSubmitText, onFiles }: ComposerProps) {
  const [text, setText] = useState('');
  const [source, setSource] = useState('');
  const [over, setOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const tid = useId();
  const sid = useId();

  const submit = (): void => {
    onSubmitText(text, source.trim());
    // The textarea keeps its text until the article is read, so a failed read loses nothing.
  };

  const onDrop = (e: DragEvent): void => {
    e.preventDefault();
    setOver(false);
    const files = [...e.dataTransfer.files];
    if (files.length > 0) onFiles(files);
    else {
      const dropped = e.dataTransfer.getData('text/plain');
      if (dropped) setText(dropped);
    }
  };

  return (
    <form
      className={`card composer${over ? ' is-over' : ''}`}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
    >
      <label htmlFor={tid} className="field-label">
        Paste an article
      </label>
      <textarea
        id={tid}
        className="field"
        rows={6}
        placeholder="Paste the article text here. Put a blank line between paragraphs."
        value={text}
        onChange={(e) => setText(e.target.value)}
        spellCheck={false}
      />
      <div className="composer-row">
        <div className="composer-source">
          <label htmlFor={sid} className="field-label">
            Source name (optional)
          </label>
          <input
            id={sid}
            className="field"
            type="text"
            placeholder="Where it came from"
            value={source}
            maxLength={60}
            onChange={(e) => setSource(e.target.value)}
            autoComplete="off"
          />
        </div>
        <div className="composer-actions">
          <button type="submit" className="btn btn-secondary" aria-busy={busy || undefined}>
            <Icon name="plus" /> Add article
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => fileRef.current?.click()}>
            <Icon name="upload" /> Choose files
          </button>
          <input
            ref={fileRef}
            type="file"
            multiple
            accept=".txt,.md,.markdown,.html,.htm,text/plain,text/html,text/markdown"
            hidden
            onChange={(e) => {
              const files = [...(e.target.files ?? [])];
              e.target.value = '';
              if (files.length > 0) onFiles(files);
            }}
          />
        </div>
      </div>
      <p className="hint">
        Or drop .txt, .md or .html files anywhere on this page. Each one is read in the order you
        add it.
      </p>
    </form>
  );
}
