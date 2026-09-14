import type { JSX } from 'react';
import { Bid, isTrump, type Card, type PlayerView } from '@tarot/engine';
import { CardFace } from '../cards/CardFace.tsx';
import { useI18n } from '../i18n/index.ts';
import { bidLabel, poigneeLabel } from '../state/labels.ts';

const DOT = '\u00b7';
const ELLIPSIS = '\u2026';
import type { Affordances, EcartState } from '../state/moves.ts';

export interface ActionBarProps {
  view: PlayerView;
  can: Affordances;
  ecart: EcartState;
  seatName(seat: number): string;
  onBid(bid: Bid): void;
  onCall(card: Card): void;
  onConfirmEcart(): void;
  onAutoEcart(): void;
  onChelem(announce: boolean): void;
  onPoignee(show: boolean): void;
}

/**
 * What the player is being asked for right now. One question at a time, with
 * the buttons big enough to hit with a thumb.
 */
export function ActionBar(props: ActionBarProps): JSX.Element {
  const { view, can, ecart } = props;
  const { t } = useI18n();

  if (!can.myTurn && view.phase !== 'playing') {
    return (
      <div className="actions">
        <div className="prompt">{props.seatName(view.currentPlayer)}…</div>
      </div>
    );
  }

  switch (view.phase) {
    case 'bidding':
      return (
        <div className="actions">
          <div className="prompt">{t.bid.yourTurn}</div>
          <div className="row">
            {can.bids.map((bid) => (
              <button
                key={bid}
                type="button"
                className={bid === Bid.Pass ? 'ghost' : 'primary'}
                onClick={() => props.onBid(bid)}
              >
                {bidLabel(bid, t)}
              </button>
            ))}
          </div>
        </div>
      );

    case 'calling':
      return (
        <div className="actions">
          <div className="prompt">
            {t.call.heading}. {t.call.detail}
          </div>
          <div className="row">
            {can.calls.map((card) => (
              <button
                key={card}
                type="button"
                className="ghost"
                style={{ padding: 4, minWidth: 0 }}
                onClick={() => props.onCall(card)}
                aria-label={`${t.call.confirm} ${card}`}
              >
                <CardFace card={card} width={44} />
              </button>
            ))}
          </div>
        </div>
      );

    case 'discard':
      return (
        <div className="actions">
          <div className="prompt">
            {t.ecart.heading} · {t.ecart.remaining(ecart.remaining)}
            {ecart.trumpsAllowed > 0 ? ` · ${t.ecart.trumpsShown}` : ''}
          </div>
          <div className="row">
            <button type="button" className="ghost" onClick={props.onAutoEcart}>
              {t.ecart.auto}
            </button>
            <button
              type="button"
              className="primary"
              disabled={!ecart.complete || ecart.error !== null}
              onClick={props.onConfirmEcart}
            >
              {t.ecart.confirm}
            </button>
          </div>
        </div>
      );

    case 'chelem':
      return (
        <div className="actions">
          <div className="prompt">
            {t.chelem.heading} {t.chelem.detail}
          </div>
          <div className="row">
            <button type="button" className="ghost" onClick={() => props.onChelem(false)}>
              {t.chelem.no}
            </button>
            <button type="button" className="primary" onClick={() => props.onChelem(true)}>
              {t.chelem.yes}
            </button>
          </div>
        </div>
      );

    case 'playing':
      if (can.poignee) {
        return (
          <div className="actions">
            <div className="prompt">
              {t.poignee.offer(poigneeLabel(can.poignee, t))}
              <span className="shown-cards">
                {view.hand.filter(isTrump).slice(0, 3).map((c) => (
                  <CardFace key={c} card={c} width={22} />
                ))}
              </span>
            </div>
            <div className="row">
              <button type="button" className="ghost" onClick={() => props.onPoignee(false)}>
                {t.poignee.skip}
              </button>
              <button type="button" className="primary" onClick={() => props.onPoignee(true)}>
                {t.poignee.show}
              </button>
            </div>
          </div>
        );
      }
      return (
        <div className="actions">
          <div className="prompt">
            {can.myTurn ? t.table.yourTurn : `${props.seatName(view.currentPlayer)}…`}
          </div>
        </div>
      );

    /* c8 ignore next 3 -- finished hands are handled by the score screen */
    default:
      return <div className="actions" />;
  }
}
