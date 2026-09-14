import { describe, expect, it } from 'vitest';
import { DEFAULT_LANG, DICTS, en, fr } from '../src/i18n/index.ts';
import { RULES } from '../src/rules/content.ts';

type Shape = { [key: string]: Shape | 'string' | 'fn' };

function shapeOf(value: unknown): Shape | 'string' | 'fn' {
  if (typeof value === 'function') return 'fn';
  if (typeof value === 'string') return 'string';
  const shape: Shape = {};
  for (const [key, child] of Object.entries(value as object)) shape[key] = shapeOf(child);
  return shape;
}

describe('the dictionaries', () => {
  it('start in French, as the spec asks', () => {
    expect(DEFAULT_LANG).toBe('fr');
    expect(DICTS.fr).toBe(fr);
  });

  it('have exactly the same shape, so nothing can fall back to a missing key', () => {
    expect(shapeOf(en)).toEqual(shapeOf(fr));
  });

  it('keep the French terms of art in both languages', () => {
    const terms = ['Petite', 'Garde', 'Garde Sans', 'Garde Contre'];
    for (const dict of [fr, en]) {
      const bids = Object.values(dict.bid).filter((v) => typeof v === 'string');
      for (const term of terms) expect(bids).toContain(term);
    }
    // preneur, chien, ecart, atout, poignee, chelem, petit au bout
    const french = JSON.stringify(fr);
    for (const word of ['Preneur', 'chien', 'écart', 'atout', 'Poignée', 'chelem', 'Petit au bout']) {
      expect(french.toLowerCase()).toContain(word.toLowerCase());
    }
  });

  it('spell the French with its accents', () => {
    expect(fr.phase.bidding).toBe('Enchères');
    expect(fr.table.yourTurn).toBe('À vous de jouer');
    expect(fr.score.heading).toBe('Décompte de la donne');
    expect(fr.illegal['must-overtrump']).toBe('Vous devez monter à l’atout');
  });

  it('have a reason for every way a card can be refused', () => {
    const reasons = [
      'must-follow-suit',
      'must-play-trump',
      'must-overtrump',
      'must-follow-trump',
      'not-in-hand',
    ] as const;
    for (const reason of reasons) {
      expect(fr.illegal[reason]).toBeTruthy();
      expect(en.illegal[reason]).toBeTruthy();
    }
  });
});

describe('the phrases that take a number', () => {
  it('get the plural right in both languages', () => {
    expect(fr.setup.playersAt(4)).toBe('4 joueurs');
    expect(fr.setup.resumeDetail(1)).toBe('1 donne jouée');
    expect(fr.setup.resumeDetail(3)).toBe('3 donnes jouées');
    expect(fr.table.tricks(1)).toBe('1 pli');
    expect(fr.table.tricks(4)).toBe('4 plis');
    expect(fr.ecart.remaining(1)).toBe('Encore 1 carte à écarter');
    expect(fr.ecart.remaining(6)).toBe('Encore 6 cartes à écarter');

    expect(en.setup.resumeDetail(1)).toBe('1 hand played');
    expect(en.setup.resumeDetail(2)).toBe('2 hands played');
    expect(en.table.tricks(1)).toBe('1 trick');
    expect(en.ecart.remaining(2)).toBe('2 more cards to bury');
  });

  it('fill in the names they are given', () => {
    for (const dict of [fr, en]) {
      expect(dict.bid.waiting('Nord')).toContain('Nord');
      expect(dict.chelem.announcedBy('Nord')).toContain('Nord');
      expect(dict.poignee.offer('simple')).toContain('simple');
      expect(dict.poignee.shownBy('Nord', 'double')).toContain('Nord');
      expect(dict.table.trickTo('Nord')).toContain('Nord');
      expect(dict.score.takerLabel('Nord')).toContain('Nord');
      expect(dict.score.withPartner('Sud')).toContain('Sud');
      expect(dict.setup.playersAt(5)).toContain('5');
    }
  });
});

describe('the rules reference', () => {
  it('covers the same ground in both languages', () => {
    expect(RULES.fr.map((s) => s.id)).toEqual(RULES.en.map((s) => s.id));
    expect(RULES.fr).toHaveLength(8);
    for (const sections of Object.values(RULES)) {
      for (const section of sections) {
        expect(section.title).toBeTruthy();
        expect(section.blocks.length).toBeGreaterThan(0);
      }
    }
  });

  it('carries the scoring cheat sheet the spec asks for', () => {
    const scoring = RULES.fr.find((s) => s.id === 'scoring');
    const tables = scoring?.blocks.filter((b) => b.kind === 'table') ?? [];
    const targets = tables.find((b) => b.kind === 'table' && b.rows.length === 4);
    expect(targets).toBeDefined();
    if (targets?.kind === 'table') {
      expect(targets.rows.map((r) => r[1])).toEqual(['56', '51', '41', '36']);
    }
    const bonuses = RULES.fr.find((s) => s.id === 'bonuses');
    const poignee = bonuses?.blocks.find((b) => b.kind === 'table');
    if (poignee?.kind === 'table') {
      expect(poignee.rows).toEqual([
        ['Simple', '13', '10', '8', '20'],
        ['Double', '15', '13', '10', '30'],
        ['Triple', '18', '15', '13', '40'],
      ]);
    }
  });
});
