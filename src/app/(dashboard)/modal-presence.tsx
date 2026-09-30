'use client';

import { useEffect, useState, type ReactNode } from 'react';

/** Matches the .admin-modal exit animation in globals.css. */
const EXIT_MS = 150;

/**
 * Lets a conditionally rendered modal animate out. Wrap the `{open && <Modal />}`
 * expression: when it turns falsy, the last modal stays on screen, marked as
 * closing, for the length of the exit animation, then unmounts.
 */
export function ModalPresence({ children }: { children: ReactNode }) {
  const [shown, setShown] = useState<ReactNode>(children);
  const [closing, setClosing] = useState(false);

  // Adjusting state during render, as with a derived prop: an open modal always
  // shows its latest props, and a close keeps the last ones for the exit.
  if (children && children !== shown) {
    setShown(children);
    setClosing(false);
  } else if (!children && shown && !closing) {
    setClosing(true);
  }

  useEffect(() => {
    if (!closing) return;
    const timer = setTimeout(() => {
      setShown(null);
      setClosing(false);
    }, EXIT_MS);
    return () => clearTimeout(timer);
  }, [closing]);

  if (!shown) return null;

  return (
    <div className="admin-modal-presence" data-closing={closing || undefined}>
      {shown}
    </div>
  );
}
