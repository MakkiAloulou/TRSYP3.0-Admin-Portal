import { useEffect } from 'react';

/**
 * Calls `onEscape` when Escape is pressed, for closing modals from the
 * keyboard. Pass null to ignore the key, e.g. while a request is in flight.
 */
export function useEscapeKey(onEscape: (() => void) | null) {
  useEffect(() => {
    if (!onEscape) return;
    const handler = onEscape;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') handler();
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onEscape]);
}
