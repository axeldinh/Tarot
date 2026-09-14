import { useEffect, type JSX } from 'react';

export interface ToastProps {
  message: string | null;
  onDone(): void;
  /** How long the message stays up. */
  ms?: number;
}

/** The one-line reason a card was refused. */
export function Toast({ message, onDone, ms = 2200 }: ToastProps): JSX.Element | null {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(onDone, ms);
    return () => clearTimeout(timer);
  }, [message, ms, onDone]);

  if (!message) return null;
  return (
    <div className="toast" role="status">
      {message}
    </div>
  );
}
