import type { JSX, ReactNode } from 'react';
import { useI18n } from '../i18n/index.ts';

export interface SheetProps {
  title: string;
  onClose(): void;
  children: ReactNode;
}

export function Sheet({ title, onClose, children }: SheetProps): JSX.Element {
  const { t } = useI18n();
  return (
    <div className="sheet" role="dialog" aria-label={title} onClick={onClose}>
      <div className="sheet-inner" onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        {children}
        <div className="stack" style={{ marginTop: 16 }}>
          <button type="button" onClick={onClose}>
            {t.table.close}
          </button>
        </div>
      </div>
    </div>
  );
}
