import { useCallback, useMemo, useState, type JSX } from 'react';
import {
  Bid,
  LAYOUT,
  isBout,
  isKing,
  isTrump,
  type Card,
  type PlayerView,
  type PoigneeKind,
} from '@tarot/engine';
import { CONFIG, chooseEcart } from '@tarot/bots';
import type { SessionSnapshot } from '@tarot/net';
import { ActionBar } from '../components/ActionBar.tsx';
import { CardFace } from '../cards/CardFace.tsx';
import { Hand } from '../components/Hand.tsx';
import { PlayerBadge } from '../components/PlayerBadge.tsx';
import { Scoreboard } from '../components/Scoreboard.tsx';
import { Sheet } from '../components/Sheet.tsx';
import { Toast } from '../components/Toast.tsx';
import { TrickArea, seatAnchor } from '../components/TrickArea.tsx';
import { useI18n } from '../i18n/index.ts';
import { bidLabel, illegalLabel } from '../state/labels.ts';
import { affordances, ecartState, reasonFor } from '../state/moves.ts';
import type { GameApi } from '../state/gameApi.ts';

const DOT = '·';

export interface TableScreenProps {
  game: GameApi;
  view: PlayerView;
  session: SessionSnapshot;
  onRules(): void;
  onQuit(): void;
}

export function TableScreen({ game, view, session, onRules, onQuit }: TableScreenProps): JSX.Element {
  const { t } = useI18n();
  const [chosen, setChosen] = useState<Card[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  /** Which hand the player waved the poignee offer away in. */
  const [poigneeDeclined, setPoigneeDeclined] = useState<number | null>(null);

  const base = affordances(view);
  const can =
    base.poignee && poigneeDeclined === session.handsDealt ? { ...base, poignee: null } : base;
  const chienSize = LAYOUT[view.playerCount].chienSize;
  const ecart = ecartState(view.hand, chosen, chienSize);

  const seatName = useCallback(
    (seat: number) => session.seats[seat]?.name ?? `#${seat + 1}`,
    [session],
  );

  const tricksBy = useMemo(() => {
    const counts = new Array<number>(view.playerCount).fill(0);
    for (const trick of view.tricks) counts[trick.winner] = (counts[trick.winner] as number) + 1;
    return counts;
  }, [view.tricks, view.playerCount]);

  // Seats other than yours, running anticlockwise from your left.
  const others = useMemo(
    () =>
      Array.from({ length: view.playerCount - 1 }, (_, i) => (view.self + i + 1) % view.playerCount),
    [view.self, view.playerCount],
  );

  const playable = useMemo<Set<Card>>(() => {
    if (view.phase === 'discard' && can.myTurn) {
      return new Set(view.hand.filter((c) => !ecart.forbidden.has(c)));
    }
    return new Set(can.legal);
  }, [view.phase, view.hand, can.myTurn, can.legal, ecart.forbidden]);

  const onCardTap = useCallback(
    (card: Card) => {
      if (view.phase === 'discard') {
        setChosen((current) =>
          current.includes(card)
            ? current.filter((c) => c !== card)
            : current.length < chienSize
              ? [...current, card]
              : current,
        );
        return;
      }
      game.play({ type: 'PlayCard', player: view.self, card });
    },
    [view.phase, view.self, chienSize, game],
  );

  const onBlocked = useCallback(
    (card: Card) => {
      // The ecart has its own reasons for refusing a card, not the ones about
      // following suit.
      if (view.phase === 'discard') {
        if (isKing(card)) setNote(t.ecart.noKing);
        else if (isBout(card)) setNote(t.ecart.noBout);
        else if (isTrump(card)) setNote(t.ecart.tooManyTrumps);
        return;
      }
      if (!can.myTurn) return;
      const reason = reasonFor(view, card);
      if (reason) setNote(illegalLabel(reason, t));
    },
    [view, can.myTurn, t],
  );

  // Only while a card is actually being asked for. During the bidding the
  // action bar is already carrying it, and two things saying the same thing is
  // one too many.
  const yourTurn = can.myTurn && view.phase === 'playing';

  const contractChip = view.contract !== null
    ? `${bidLabel(view.contract as Bid, t)} ${DOT} ${seatName(view.taker as number)}`
    : t.phase[view.phase];

  return (
    <>
      <div className="topbar">
        <span className="contract-chip">{contractChip}</span>
        {view.calledCard !== null && (
          <span className="called-king-chip">
            <CardFace card={view.calledCard} width={36} />
            {t.table.calledKing}
          </span>
        )}
        <span className="spacer" />
        {session.undoAvailable && game.undo && (
          <button type="button" className="small ghost" onClick={game.undo}>
            {t.table.undo}
          </button>
        )}
        <button type="button" className="small ghost" onClick={() => setMenuOpen(true)}>
          {t.table.menu}
        </button>
      </div>

      <div className="table">
        <TrickArea
          view={view}
          cardWidth={54}
          waitingFor={seatName(view.currentPlayer)}
          seatName={seatName}
        />
        {others.map((seat, i) => {
          const info = session.seats[seat];
          if (!info) return null;
          const anchor = seatAnchor(i + 1, view.playerCount);
          return (
            <div key={seat} className={`seat seat-${anchor.side}`} style={anchor.style}>
              <PlayerBadge seat={info} view={view} tricks={tricksBy[seat] as number} />
            </div>
          );
        })}
      </div>

      <div className="actions-wrap">
        <Toast
          message={note ?? game.rejection?.message ?? null}
          onDone={() => {
            setNote(null);
            game.dismissRejection();
          }}
        />
        <ActionBar
        view={view}
        can={can}
        ecart={ecart}
        seatName={seatName}
        onBid={(bid) => game.play({ type: 'Bid', player: view.self, bid })}
        onCall={(card) => game.play({ type: 'CallKing', player: view.self, card })}
        onAutoEcart={() =>
          setChosen(chooseEcart(view.hand, chienSize, CONFIG.normal.ecart))
        }
        onConfirmEcart={() => {
          game.play({ type: 'Discard', player: view.self, cards: chosen });
          setChosen([]);
        }}
        onChelem={(announce) =>
          game.play({ type: 'AnnounceChelem', player: view.self, announce })
        }
        onPoignee={(show) => {
          // Waving the offer away just puts the hand back in charge; the window
          // closes for real when the first card is played.
          if (!show || !can.poignee) {
            setPoigneeDeclined(session.handsDealt);
            return;
          }
          game.play({
            type: 'AnnouncePoignee',
            player: view.self,
            kind: can.poignee as PoigneeKind,
          });
        }}
        />
      </div>

      <Hand
        cards={view.hand}
        playable={playable}
        chosen={new Set(chosen)}
        fromChien={view.phase === 'discard' && view.chien ? new Set(view.chien) : undefined}
        cardWidth={58}
        choosing={can.myTurn && (view.phase === 'playing' || view.phase === 'discard')}
        onPlay={onCardTap}
        onBlocked={onBlocked}
        highlight={yourTurn}
      />


      {menuOpen && (
        <Sheet title={t.table.menu} onClose={() => setMenuOpen(false)}>
          <Scoreboard session={session} />
          <div className="stack" style={{ marginTop: 16 }}>
            <button type="button" onClick={onRules}>
              {t.table.rules}
            </button>
            <button type="button" className="ghost" onClick={onQuit}>
              {t.table.quit}
            </button>
          </div>
        </Sheet>
      )}
    </>
  );
}
