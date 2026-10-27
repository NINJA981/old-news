/** Sonner, restyled to tokens: bottom-right, e3, 4 s (6 s with Undo). */
import { Toaster, toast } from 'sonner';

export function Toasts() {
  return (
    <Toaster
      position="bottom-right"
      duration={4000}
      visibleToasts={3}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            'flex w-[340px] max-w-[calc(100vw-32px)] items-center gap-3 rounded-md bg-surface-2 px-4 py-3 font-ui text-ui text-fg shadow-e3',
          title: 'flex-1',
          actionButton:
            'h-7 rounded-sm px-2 text-ui-strong text-accent-text hover:bg-surface-3 transition-colors duration-100',
        },
      }}
    />
  );
}

/** A toast that offers Undo (6 s), using the same verb as the action that caused it. */
export function toastUndo(message: string, undo: () => void): void {
  toast(message, { duration: 6000, action: { label: 'Undo', onClick: undo } });
}

export { toast };
