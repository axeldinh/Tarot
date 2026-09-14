import type { JSX } from 'react';
import { useI18n } from '../i18n/index.ts';
import { RULES } from '../rules/content.ts';

/** The rules reference and scoring cheat sheet. All local, works offline. */
export function RulesScreen({ onBack }: { onBack(): void }): JSX.Element {
  const { lang, t } = useI18n();
  const sections = RULES[lang];

  return (
    <div className="screen rules">
      <h2>{t.rules.heading}</h2>
      {sections.map((section) => (
        <section key={section.id}>
          <h3>{section.title}</h3>
          {section.blocks.map((block, i) => {
            if (block.kind === 'p') return <p key={i}>{block.text}</p>;
            if (block.kind === 'ul') {
              return (
                <ul key={i}>
                  {block.items.map((item, j) => (
                    <li key={j}>{item}</li>
                  ))}
                </ul>
              );
            }
            return (
              <table key={i}>
                <thead>
                  <tr>
                    {block.head.map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, j) => (
                    <tr key={j}>
                      {row.map((cell, k) => (
                        <td key={k}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            );
          })}
        </section>
      ))}
      <div className="stack" style={{ marginTop: 20 }}>
        <button type="button" onClick={onBack}>
          {t.rules.back}
        </button>
      </div>
    </div>
  );
}
