import { Bid, cardId, isExcuse, isTrump, rankOf, suitOf, type Card } from '@tarot/engine';
import type { Level } from '@tarot/bots';
import type { Dict } from '../i18n/index.ts';
import type { IllegalReason } from '@tarot/engine';

/** Pure mappings from engine values to whatever the current dictionary calls them. */

export function bidLabel(bid: Bid, t: Dict): string {
  switch (bid) {
    case Bid.Pass:
      return t.bid.pass;
    case Bid.Petite:
      return t.bid.petite;
    case Bid.Garde:
      return t.bid.garde;
    case Bid.GardeSans:
      return t.bid.gardeSans;
    case Bid.GardeContre:
      return t.bid.gardeContre;
    /* c8 ignore next 2 */
    default:
      return '';
  }
}

export function levelLabel(level: Level, t: Dict): string {
  return t.level[level];
}

export function illegalLabel(reason: IllegalReason, t: Dict): string {
  return t.illegal[reason];
}

export function poigneeLabel(kind: 'simple' | 'double' | 'triple', t: Dict): string {
  return t.poignee[kind];
}

/** Card points are held in halves; show them the way players say them. */
export function formatPoints(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function formatSigned(value: number): string {
  const shown = formatPoints(Math.abs(value));
  if (value > 0) return `+${shown}`;
  if (value < 0) return `−${shown}`;
  return '0';
}

/** A card's name for screen readers and for the rules reference. */
export function cardLabel(card: Card, t: Dict): string {
  void t;
  if (isExcuse(card)) return 'Excuse';
  if (isTrump(card)) return `Atout ${rankOf(card)}`;
  const suitNames = ['♠', '♥', '♦', '♣'];
  const rank = rankOf(card);
  const names: Record<number, string> = { 11: 'Valet', 12: 'Cavalier', 13: 'Dame', 14: 'Roi' };
  return `${names[rank] ?? rank} ${suitNames[suitOf(card) as number]}`;
}

export { cardId };
