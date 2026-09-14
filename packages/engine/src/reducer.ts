import {
  DAME,
  DECK_SIZE,
  EXCUSE,
  ROI,
  SUITS,
  isLowCard,
  isTrump,
  suitCard,
  type Card,
} from './cards.ts';
import { LAYOUT, deal, nextPlayer } from './deal.ts';
import { validateEcart } from './ecart.ts';
import { EngineError } from './errors.ts';
import { canAnnouncePoignee, poigneeCards } from './poignee.ts';
import { makeRng } from './rng.ts';
import { scoreState, sideOf } from './scoring.ts';
import { legalCards, trickFollowSuit, trickWinner } from './trick.ts';
import {
  Bid,
  DEFAULT_RULES,
  POIGNEE_SIZE,
  type Action,
  type CompletedTrick,
  type GameState,
  type PlayerCount,
  type PlayerView,
  type PoigneeKind,
  type Rules,
  type TrickPlay,
} from './types.ts';

export interface NewHandOptions {
  playerCount: PlayerCount;
  /** Seat that dealt. Bidding and play start on the dealer's right. */
  dealer?: number;
  seed: number;
  rules?: Partial<Rules>;
}

export function createHand(options: NewHandOptions): GameState {
  const { playerCount, seed } = options;
  const dealer = options.dealer ?? 0;
  const rng = makeRng(seed);
  const { hands, chien } = deal(playerCount, dealer, rng);
  return createHandFrom({ playerCount, dealer, hands, chien, rules: options.rules });
}

export interface ExplicitHandOptions {
  playerCount: PlayerCount;
  dealer?: number;
  hands: Card[][];
  chien: Card[];
  rules?: Partial<Rules>;
}

/**
 * Start a hand from an explicit deal. Used for replays, for syncing a client to
 * a host's deal, and for scripted tests.
 */
export function createHandFrom(options: ExplicitHandOptions): GameState {
  const { playerCount, hands, chien } = options;
  const dealer = options.dealer ?? 0;
  const { cardsPerPlayer, chienSize } = LAYOUT[playerCount];
  if (hands.length !== playerCount) {
    throw new EngineError('invalid-deal', `Expected ${playerCount} hands`);
  }
  if (chien.length !== chienSize || hands.some((h) => h.length !== cardsPerPlayer)) {
    throw new EngineError('invalid-deal', 'Deal does not match the layout for this table');
  }
  const seen = new Set<Card>([...hands.flat(), ...chien]);
  if (seen.size !== DECK_SIZE) {
    throw new EngineError('invalid-deal', 'Deal must use each of the 78 cards exactly once');
  }

  return {
    playerCount,
    dealer,
    rules: { ...DEFAULT_RULES, ...options.rules },
    phase: 'bidding',
    hands: hands.map((h) => [...h]),
    chien: [...chien],
    chienRevealed: false,
    bids: new Array<Bid | null>(playerCount).fill(null),
    currentPlayer: nextPlayer(dealer, playerCount),
    taker: null,
    contract: null,
    calledCard: null,
    partner: null,
    partnerRevealed: false,
    ecart: [],
    ecartTrumpsShown: [],
    chelemAnnouncedBy: null,
    chelemAnswers: 0,
    poignees: [],
    currentTrick: null,
    tricks: [],
    piles: Array.from({ length: playerCount }, () => []),
    excuseDebts: [],
    hasPlayed: new Array<boolean>(playerCount).fill(false),
    result: null,
  };
}

function cloneState(s: GameState): GameState {
  return {
    ...s,
    hands: s.hands.map((h) => [...h]),
    chien: [...s.chien],
    bids: [...s.bids],
    ecart: [...s.ecart],
    ecartTrumpsShown: [...s.ecartTrumpsShown],
    poignees: s.poignees.map((p) => ({ ...p, cards: [...p.cards] })),
    currentTrick: s.currentTrick
      ? { leader: s.currentTrick.leader, plays: s.currentTrick.plays.map((p) => ({ ...p })) }
      : null,
    tricks: s.tricks,
    piles: s.piles.map((p) => [...p]),
    excuseDebts: s.excuseDebts.map((d) => ({ ...d })),
    hasPlayed: [...s.hasPlayed],
  };
}

/** Cards the taker may call at 5 players: kings, or the next rank down if he holds them all. */
export function legalCalls(hand: readonly Card[]): Card[] {
  for (let rank = ROI; rank >= 1; rank--) {
    const candidates = SUITS.map((s) => suitCard(s, rank));
    if (!candidates.every((c) => hand.includes(c))) return candidates;
  }
  /* c8 ignore next 2 -- a 15-card hand cannot contain all 56 suit cards */
  return SUITS.map((s) => suitCard(s, DAME));
}

export function applyAction(state: GameState, action: Action): GameState {
  const s = cloneState(state);
  switch (action.type) {
    case 'Bid':
      applyBid(s, action.player, action.bid);
      break;
    case 'CallKing':
      applyCallKing(s, action.player, action.card);
      break;
    case 'Discard':
      applyDiscard(s, action.player, action.cards);
      break;
    case 'AnnounceChelem':
      applyChelem(s, action.player, action.announce);
      break;
    case 'AnnouncePoignee':
      applyPoignee(s, action.player, action.kind);
      break;
    case 'PlayCard':
      applyPlayCard(s, action.player, action.card);
      break;
    /* c8 ignore next 2 */
    default:
      throw new EngineError('unknown-action', `Unknown action`);
  }
  return s;
}

function expect(state: GameState, phase: GameState['phase'], player: number): void {
  if (state.phase !== phase) {
    throw new EngineError('wrong-phase', `Action not allowed during phase "${state.phase}"`);
  }
  if (state.currentPlayer !== player) {
    throw new EngineError('wrong-player', `It is player ${state.currentPlayer}'s turn`);
  }
}

/** Highest bid so far, `Bid.Pass` when everyone has passed. */
export function highestBid(state: GameState): Bid {
  let best: Bid = Bid.Pass;
  for (const b of state.bids) if (b !== null && b > best) best = b;
  return best;
}

function applyBid(s: GameState, player: number, bid: Bid): void {
  expect(s, 'bidding', player);
  if (bid !== Bid.Pass && bid <= highestBid(s)) {
    throw new EngineError('bid-too-low', 'A bid must beat the highest bid so far');
  }
  s.bids[player] = bid;

  const remaining = s.bids.some((b) => b === null);
  if (remaining) {
    s.currentPlayer = nextPlayer(player, s.playerCount);
    return;
  }

  const best = highestBid(s);
  if (best === Bid.Pass) {
    s.phase = 'passed';
    return;
  }
  s.taker = s.bids.indexOf(best);
  s.contract = best;
  s.currentPlayer = s.taker;

  if (s.playerCount === 5) {
    s.phase = 'calling';
    return;
  }
  afterCall(s);
}

/** Common path once the partner question is settled (immediately at 3 and 4). */
function afterCall(s: GameState): void {
  const contract = s.contract as Bid;
  if (contract === Bid.Petite || contract === Bid.Garde) {
    s.chienRevealed = true;
    (s.hands[s.taker as number] as Card[]).push(...s.chien);
    s.phase = 'discard';
    s.currentPlayer = s.taker as number;
    return;
  }
  startChelemPhase(s);
}

function applyCallKing(s: GameState, player: number, card: Card): void {
  expect(s, 'calling', player);
  if (!legalCalls(s.hands[player] as Card[]).includes(card)) {
    throw new EngineError('illegal-call', 'That card cannot be called');
  }
  s.calledCard = card;
  afterCall(s);
}

function applyDiscard(s: GameState, player: number, cards: Card[]): void {
  expect(s, 'discard', player);
  const hand = s.hands[player] as Card[];
  const size = LAYOUT[s.playerCount].chienSize;
  const error = validateEcart(hand, cards, size);
  if (error) throw new EngineError('illegal-ecart', `Illegal ecart: ${error}`);

  for (const c of cards) hand.splice(hand.indexOf(c), 1);
  s.ecart = [...cards];
  s.ecartTrumpsShown = cards.filter(isTrump);
  s.chien = [];
  startChelemPhase(s);
}

function startChelemPhase(s: GameState): void {
  locatePartner(s);
  s.phase = 'chelem';
  s.chelemAnswers = 0;
  s.currentPlayer = nextPlayer(s.dealer, s.playerCount);
}

function applyChelem(s: GameState, player: number, announce: boolean): void {
  expect(s, 'chelem', player);
  if (announce) {
    if (s.chelemAnnouncedBy !== null) {
      throw new EngineError('chelem-already-announced', 'A chelem has already been announced');
    }
    s.chelemAnnouncedBy = player;
  }
  s.chelemAnswers += 1;
  if (s.chelemAnswers < s.playerCount) {
    s.currentPlayer = nextPlayer(player, s.playerCount);
    return;
  }
  startPlay(s);
}

function startPlay(s: GameState): void {
  s.phase = 'playing';
  const leader = s.chelemAnnouncedBy ?? nextPlayer(s.dealer, s.playerCount);
  s.currentTrick = { leader, plays: [] };
  s.currentPlayer = leader;
}

/** Find who holds the called card once the chien has been dealt with. */
function locatePartner(s: GameState): void {
  if (s.calledCard === null) {
    s.partner = null;
    return;
  }
  const holder = s.hands.findIndex((h) => h.includes(s.calledCard as Card));
  // Not in anyone's hand means it sits in an unseen chien: the taker plays alone.
  s.partner = holder < 0 ? null : holder;
}

function applyPoignee(s: GameState, player: number, kind: PoigneeKind): void {
  if (s.phase !== 'playing') {
    throw new EngineError('wrong-phase', 'A poignee is shown during the play');
  }
  if (s.currentPlayer !== player) {
    throw new EngineError('wrong-player', `It is player ${s.currentPlayer}'s turn`);
  }
  if (s.hasPlayed[player]) {
    throw new EngineError('poignee-too-late', 'A poignee is shown before your first card');
  }
  if (s.poignees.some((p) => p.player === player)) {
    throw new EngineError('poignee-already-announced', 'You have already shown a poignee');
  }
  const hand = s.hands[player] as Card[];
  if (!canAnnouncePoignee(hand, s.playerCount, kind)) {
    throw new EngineError('illegal-poignee', 'You do not hold enough trumps for that poignee');
  }
  const cards = poigneeCards(hand, POIGNEE_SIZE[s.playerCount][kind]) as Card[];
  s.poignees = [...s.poignees, { player, kind, cards }];
}

function applyPlayCard(s: GameState, player: number, card: Card): void {
  if (s.phase !== 'playing') {
    throw new EngineError('wrong-phase', 'No card can be played now');
  }
  if (s.currentPlayer !== player) {
    throw new EngineError('wrong-player', `It is player ${s.currentPlayer}'s turn`);
  }
  const hand = s.hands[player] as Card[];
  const trick = s.currentTrick as { leader: number; plays: TrickPlay[] };
  if (!legalCards(hand, trick.plays).includes(card)) {
    throw new EngineError('illegal-card', 'That card cannot be played');
  }

  hand.splice(hand.indexOf(card), 1);
  trick.plays = [...trick.plays, { player, card }];
  s.hasPlayed[player] = true;

  if (card === s.calledCard) s.partnerRevealed = true;

  if (trick.plays.length < s.playerCount) {
    s.currentPlayer = nextPlayer(player, s.playerCount);
    return;
  }
  resolveTrick(s);
}

function resolveTrick(s: GameState): void {
  const trick = s.currentTrick as { leader: number; plays: TrickPlay[] };
  const totalTricks = LAYOUT[s.playerCount].cardsPerPlayer;
  const isLastTrick = s.tricks.length + 1 === totalTricks;

  const excusePlay = trick.plays.find((p) => p.card === EXCUSE);
  const excuseWins = excusePlay !== undefined && isLastTrick && chelemExcuseWins(s, excusePlay);
  const winner = trickWinner(trick.plays, { excuseWins });

  let excuseKept = false;
  const toWinner: Card[] = [];
  for (const p of trick.plays) {
    if (p.card === EXCUSE && !excuseWins && !isLastTrick && p.player !== winner) {
      // The Excuse goes home; its owner owes the winner a low card in exchange.
      (s.piles[p.player] as Card[]).push(EXCUSE);
      excuseKept = true;
      payForExcuse(s, p.player, winner);
    } else {
      toWinner.push(p.card);
    }
  }
  if (excuseWins) excuseKept = true;
  (s.piles[winner] as Card[]).push(...toWinner);

  const completed: CompletedTrick = {
    index: s.tricks.length,
    leader: trick.leader,
    plays: trick.plays,
    winner,
    followSuit: trickFollowSuit(trick.plays),
    excuseKept,
  };
  s.tricks = [...s.tricks, completed];

  if (s.tricks.length === totalTricks) {
    finishHand(s);
    return;
  }
  s.currentTrick = { leader: winner, plays: [] };
  s.currentPlayer = winner;
}

/**
 * The chelem exception: the announcer leads the Excuse to the last trick having
 * taken everything so far, and it wins.
 */
function chelemExcuseWins(s: GameState, excusePlay: TrickPlay): boolean {
  if (s.chelemAnnouncedBy === null) return false;
  if (excusePlay.player !== s.chelemAnnouncedBy) return false;
  if ((s.currentTrick as { leader: number }).leader !== excusePlay.player) return false;
  const side = sideOf(excusePlay.player, s.taker as number, s.partner);
  return s.tricks.every((t) => sideOf(t.winner, s.taker as number, s.partner) === side);
}

/** Hand the trick winner a low card from the Excuse player's pile, or note the debt. */
function payForExcuse(s: GameState, debtor: number, creditor: number): void {
  const pile = s.piles[debtor] as Card[];
  const index = pile.findIndex((c) => isLowCard(c));
  if (index < 0) {
    s.excuseDebts = [...s.excuseDebts, { debtor, creditor }];
    return;
  }
  const [card] = pile.splice(index, 1);
  (s.piles[creditor] as Card[]).push(card as Card);
}

/** Settle the Excuse debts, reveal the partner and score. */
function finishHand(s: GameState): void {
  for (const debt of s.excuseDebts) {
    const pile = s.piles[debt.debtor] as Card[];
    const index = pile.findIndex((c) => isLowCard(c));
    if (index >= 0) {
      const [card] = pile.splice(index, 1);
      (s.piles[debt.creditor] as Card[]).push(card as Card);
      continue;
    }
    // Never took a trick: the Excuse itself goes to the player who was owed.
    const excuseIndex = pile.indexOf(EXCUSE);
    if (excuseIndex >= 0) {
      pile.splice(excuseIndex, 1);
      (s.piles[debt.creditor] as Card[]).push(EXCUSE);
    }
  }
  s.excuseDebts = [];
  s.currentTrick = null;
  s.partnerRevealed = s.partner !== null;
  s.phase = 'done';
  s.result = scoreState(s);
}

export function isTerminal(state: GameState): boolean {
  return state.phase === 'done' || state.phase === 'passed';
}

/** Every action the player to move may legally take. */
export function legalActions(state: GameState): Action[] {
  const player = state.currentPlayer;
  switch (state.phase) {
    case 'bidding': {
      const best = highestBid(state);
      const bids: Bid[] = [Bid.Pass];
      for (const b of [Bid.Petite, Bid.Garde, Bid.GardeSans, Bid.GardeContre]) {
        if (b > best) bids.push(b);
      }
      return bids.map((bid) => ({ type: 'Bid', player, bid }));
    }
    case 'calling':
      return legalCalls(state.hands[player] as Card[]).map((card) => ({
        type: 'CallKing',
        player,
        card,
      }));
    case 'chelem':
      return [
        { type: 'AnnounceChelem', player, announce: false },
        ...(state.chelemAnnouncedBy === null
          ? [{ type: 'AnnounceChelem', player, announce: true } as Action]
          : []),
      ];
    case 'playing': {
      const hand = state.hands[player] as Card[];
      const plays = (state.currentTrick as { plays: TrickPlay[] }).plays;
      const actions: Action[] = legalCards(hand, plays).map((card) => ({
        type: 'PlayCard',
        player,
        card,
      }));
      if (!state.hasPlayed[player] && !state.poignees.some((p) => p.player === player)) {
        for (const kind of ['simple', 'double', 'triple'] as const) {
          if (canAnnouncePoignee(hand, state.playerCount, kind)) {
            actions.push({ type: 'AnnouncePoignee', player, kind });
          }
        }
      }
      return actions;
    }
    // The ecart is a large combinatorial choice; callers build it with
    // `discardableCards` / `validateEcart` rather than enumerating it here.
    case 'discard':
    default:
      return [];
  }
}

/** Exactly what player `p` is allowed to see. Bots are handed this and nothing else. */
export function playerView(state: GameState, p: number): PlayerView {
  const isTaker = state.taker === p;
  return {
    playerCount: state.playerCount,
    self: p,
    dealer: state.dealer,
    phase: state.phase,
    hand: [...(state.hands[p] as Card[])],
    chien: state.chienRevealed && state.phase === 'discard' ? [...state.chien] : null,
    bids: [...state.bids],
    currentPlayer: state.currentPlayer,
    taker: state.taker,
    contract: state.contract,
    calledCard: state.calledCard,
    partner: state.partnerRevealed || state.partner === p ? state.partner : null,
    ecart: isTaker ? [...state.ecart] : null,
    ecartTrumpsShown: [...state.ecartTrumpsShown],
    chelemAnnouncedBy: state.chelemAnnouncedBy,
    poignees: state.poignees.map((x) => ({ ...x, cards: [...x.cards] })),
    currentTrick: state.currentTrick
      ? {
          leader: state.currentTrick.leader,
          plays: state.currentTrick.plays.map((x) => ({ ...x })),
        }
      : null,
    tricks: state.tricks,
    cardsLeft: state.hands.map((h) => h.length),
    result: state.result,
  };
}
