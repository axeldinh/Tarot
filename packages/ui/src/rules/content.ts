import type { Lang } from '../i18n/index.ts';

export interface RuleSection {
  id: string;
  title: string;
  /** Paragraphs and bullet lists, in order. */
  blocks: ({ kind: 'p'; text: string } | { kind: 'ul'; items: string[] } | { kind: 'table'; head: string[]; rows: string[][] })[];
}

const FR: RuleSection[] = [
  {
    id: 'deck',
    title: 'Le jeu',
    blocks: [
      {
        kind: 'p',
        text: '78 cartes : quatre couleurs de 14 cartes (1 à 10, Valet, Cavalier, Dame, Roi), 21 atouts numérotés, et l’Excuse.',
      },
      {
        kind: 'p',
        text: 'Les trois bouts sont le Petit (atout 1), le 21 et l’Excuse. Ils valent chacun 4,5 points et décident de l’objectif du preneur.',
      },
      {
        kind: 'table',
        head: ['Carte', 'Valeur'],
        rows: [
          ['Roi', '4,5'],
          ['Dame', '3,5'],
          ['Cavalier', '2,5'],
          ['Valet', '1,5'],
          ['Chaque bout', '4,5'],
          ['Toute autre carte', '0,5'],
        ],
      },
      { kind: 'p', text: 'Total du jeu : 91 points. On compte par paires, une carte forte avec une basse.' },
    ],
  },
  {
    id: 'deal',
    title: 'La donne',
    blocks: [
      {
        kind: 'table',
        head: ['Joueurs', 'Cartes', 'Chien'],
        rows: [
          ['3', '24', '6'],
          ['4', '18', '6'],
          ['5', '15', '3'],
        ],
      },
      {
        kind: 'p',
        text: 'On donne par paquets de trois, dans le sens inverse des aiguilles d’une montre. Le chien se construit carte par carte pendant la donne, jamais avec la première ni la dernière.',
      },
    ],
  },
  {
    id: 'bidding',
    title: 'Les enchères',
    blocks: [
      {
        kind: 'p',
        text: 'Chacun parle une fois : Passe, Petite, Garde, Garde Sans, Garde Contre. Chaque enchère doit dépasser la précédente. Le plus haut enchérisseur est le preneur ; les autres forment la défense. Si tout le monde passe, on redonne.',
      },
      {
        kind: 'p',
        text: 'À cinq, le preneur appelle un roi avant de voir le chien. Celui qui le détient est son partenaire et ne doit pas se déclarer : l’association devient publique quand la carte tombe. S’il appelle un roi qu’il a en main, il joue seul.',
      },
    ],
  },
  {
    id: 'chien',
    title: 'Le chien',
    blocks: [
      {
        kind: 'ul',
        items: [
          'Petite et Garde : le chien est retourné face visible, entre dans la main du preneur, qui écarte autant de cartes. L’écart compte dans ses levées.',
          'On ne peut écarter ni roi ni bout. Un atout ne s’écarte que si on ne peut pas faire autrement, et il est montré à tous.',
          'Garde Sans : le chien n’est pas vu et compte pour le preneur.',
          'Garde Contre : le chien n’est pas vu et compte pour la défense.',
        ],
      },
    ],
  },
  {
    id: 'play',
    title: 'Le jeu de la carte',
    blocks: [
      {
        kind: 'ul',
        items: [
          'Il faut fournir à la couleur demandée.',
          'Si on est sec dans la couleur, il faut couper.',
          'Si un atout est déjà tombé, il faut monter dessus si on le peut ; sinon on joue quand même un atout.',
          'Sans la couleur ni atout, on joue ce qu’on veut.',
          'Le plus fort atout remporte le pli ; sinon la plus forte carte de la couleur demandée.',
        ],
      },
    ],
  },
  {
    id: 'excuse',
    title: 'L’Excuse',
    blocks: [
      {
        kind: 'ul',
        items: [
          'Elle se joue à tout moment, sans tenir compte des obligations ci-dessus.',
          'Elle ne remporte jamais le pli.',
          'Elle retourne dans les levées de celui qui l’a jouée, qui donne en echange une basse carte au gagnant du pli. S’il n’en a pas encore, il la doit pour la fin.',
          'Jouée au dernier pli, elle est perdue — sauf pour le joueur qui réalise un chelem annoncé et la mène au dernier pli.',
        ],
      },
    ],
  },
  {
    id: 'scoring',
    title: 'Le décompte',
    blocks: [
      {
        kind: 'p',
        text: 'On compte les points du preneur : ses levées, son écart, plus le chien en Garde Sans. L’objectif dépend du nombre de bouts qu’il a en fin de donne.',
      },
      {
        kind: 'table',
        head: ['Bouts', 'Points à faire'],
        rows: [
          ['0', '56'],
          ['1', '51'],
          ['2', '41'],
          ['3', '36'],
        ],
      },
      {
        kind: 'p',
        text: 'base = 25 + |écart| + petit au bout, puis multipliée par le contrat. Les primes s’ajoutent après, sans être multipliées.',
      },
      {
        kind: 'table',
        head: ['Contrat', 'Multiplicateur'],
        rows: [
          ['Petite', '×1'],
          ['Garde', '×2'],
          ['Garde Sans', '×4'],
          ['Garde Contre', '×6'],
        ],
      },
      {
        kind: 'p',
        text: 'À 3 et 4 joueurs, chaque défenseur paie le score au preneur. À 5 avec partenaire : preneur +2, partenaire +1, chaque défenseur −1. À 5 seul : preneur +4. La somme est toujours nulle.',
      },
    ],
  },
  {
    id: 'bonuses',
    title: 'Les primes',
    blocks: [
      {
        kind: 'p',
        text: 'Petit au bout : 10 points si le Petit est gagné au dernier pli. Il est dans la base, donc multiplié, et va au camp qui l’a remporté.',
      },
      {
        kind: 'table',
        head: ['Poignée', '3 j.', '4 j.', '5 j.', 'Prime'],
        rows: [
          ['Simple', '13', '10', '8', '20'],
          ['Double', '15', '13', '10', '30'],
          ['Triple', '18', '15', '13', '40'],
        ],
      },
      {
        kind: 'p',
        text: 'La poignée se montre avant de jouer sa première carte. L’Excuse n’y compte comme atout que si on en manque un. La prime va toujours au camp gagnant, quel que soit celui qui l’a montrée.',
      },
      {
        kind: 'p',
        text: 'Chelem : toutes les levées. Annoncé et réussi +400, annoncé et chuté −200, réussi sans annonce +200. Celui qui l’annonce entame.',
      },
    ],
  },
];

const EN: RuleSection[] = [
  {
    id: 'deck',
    title: 'The deck',
    blocks: [
      {
        kind: 'p',
        text: '78 cards: four suits of 14 (1 to 10, Valet, Cavalier, Dame, Roi), 21 numbered trumps, and the Excuse.',
      },
      {
        kind: 'p',
        text: 'The three bouts are the Petit (trump 1), the 21 and the Excuse. Each is worth 4.5 points and together they set the taker’s target.',
      },
      {
        kind: 'table',
        head: ['Card', 'Value'],
        rows: [
          ['Roi (king)', '4.5'],
          ['Dame (queen)', '3.5'],
          ['Cavalier (knight)', '2.5'],
          ['Valet (jack)', '1.5'],
          ['Each bout', '4.5'],
          ['Any other card', '0.5'],
        ],
      },
      { kind: 'p', text: 'The deck totals 91 points. They are counted in pairs, one honour with one low card.' },
    ],
  },
  {
    id: 'deal',
    title: 'The deal',
    blocks: [
      {
        kind: 'table',
        head: ['Players', 'Cards', 'Chien'],
        rows: [
          ['3', '24', '6'],
          ['4', '18', '6'],
          ['5', '15', '3'],
        ],
      },
      {
        kind: 'p',
        text: 'Cards go out in packets of three, anticlockwise. The chien is built one card at a time as the deal goes round, and never takes the first or the last card.',
      },
    ],
  },
  {
    id: 'bidding',
    title: 'Bidding',
    blocks: [
      {
        kind: 'p',
        text: 'Each player speaks once: Passe, Petite, Garde, Garde Sans, Garde Contre. Every bid must beat the last. The highest bidder is the taker; everyone else is the defence. If all pass, the hand is redealt.',
      },
      {
        kind: 'p',
        text: 'At five players the taker calls a king before seeing the chien. Whoever holds it is his partner and must not say so: the partnership becomes public when that card is played. Call a king you hold yourself and you play alone.',
      },
    ],
  },
  {
    id: 'chien',
    title: 'The chien',
    blocks: [
      {
        kind: 'ul',
        items: [
          'Petite and Garde: the chien is turned face up for all to see, goes into the taker’s hand, and he buries the same number of cards. The ecart counts as part of his tricks.',
          'Neither a king nor a bout may be buried. A trump goes in only when nothing else can, and is shown to everyone.',
          'Garde Sans: the chien is never seen and counts for the taker.',
          'Garde Contre: the chien is never seen and counts for the defence.',
        ],
      },
    ],
  },
  {
    id: 'play',
    title: 'Playing',
    blocks: [
      {
        kind: 'ul',
        items: [
          'You must follow the suit that was led.',
          'Void in that suit, you must trump.',
          'If a trump is already down you must overtrump if you can; if you cannot, you must still play a trump.',
          'Void in the suit and out of trumps, play anything.',
          'The highest trump takes the trick, otherwise the highest card of the suit led.',
        ],
      },
    ],
  },
  {
    id: 'excuse',
    title: 'The Excuse',
    blocks: [
      {
        kind: 'ul',
        items: [
          'It can be played at any time, ignoring every obligation above.',
          'It never wins the trick.',
          'It goes back to the tricks of whoever played it, who gives the trick winner a low card in exchange. With no trick yet, the low card is owed until the end.',
          'Played on the last trick it is lost — unless its owner is completing an announced chelem and leads it to that trick.',
        ],
      },
    ],
  },
  {
    id: 'scoring',
    title: 'Scoring',
    blocks: [
      {
        kind: 'p',
        text: 'Count the taker’s points: his tricks, his ecart, plus the chien on a Garde Sans. The target depends on how many bouts he ends up with.',
      },
      {
        kind: 'table',
        head: ['Bouts', 'Points needed'],
        rows: [
          ['0', '56'],
          ['1', '51'],
          ['2', '41'],
          ['3', '36'],
        ],
      },
      {
        kind: 'p',
        text: 'base = 25 + |difference| + petit au bout, then multiplied by the contract. Bonuses are added afterwards and are never multiplied.',
      },
      {
        kind: 'table',
        head: ['Contract', 'Multiplier'],
        rows: [
          ['Petite', 'x1'],
          ['Garde', 'x2'],
          ['Garde Sans', 'x4'],
          ['Garde Contre', 'x6'],
        ],
      },
      {
        kind: 'p',
        text: 'At 3 and 4 players every defender pays the taker. At 5 with a partner: taker +2, partner +1, each defender −1. At 5 alone: taker +4. The table always nets to zero.',
      },
    ],
  },
  {
    id: 'bonuses',
    title: 'Bonuses',
    blocks: [
      {
        kind: 'p',
        text: 'Petit au bout: 10 points for winning the Petit on the very last trick. It sits inside the multiplied base and goes to whichever side won it.',
      },
      {
        kind: 'table',
        head: ['Poignee', '3 p.', '4 p.', '5 p.', 'Bonus'],
        rows: [
          ['Simple', '13', '10', '8', '20'],
          ['Double', '15', '13', '10', '30'],
          ['Triple', '18', '15', '13', '40'],
        ],
      },
      {
        kind: 'p',
        text: 'A poignee is shown before you play your first card. The Excuse counts as a trump in it only if you would otherwise be short. The bonus always goes to the winning side, whoever showed it.',
      },
      {
        kind: 'p',
        text: 'Chelem: every trick. Announced and made +400, announced and failed −200, made without announcing +200. Whoever announces it leads the first trick.',
      },
    ],
  },
];

export const RULES: Record<Lang, RuleSection[]> = { fr: FR, en: EN };
