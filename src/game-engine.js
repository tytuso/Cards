export const SUITS = Object.freeze(['♠', '♥', '♣', '♦']);
export const SUIT_NAMES = Object.freeze({ '♠': 'Spades', '♥': 'Hearts', '♣': 'Clubs', '♦': 'Diamonds' });
const RANKS = Object.freeze(['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']);
const OPPONENT = Object.freeze({ player: 'ai', ai: 'player' });
export const CUT_LIMIT = 25;
export function cardPoints(card) {
  if (card.rank === 'JOKER') return 50;
  if (card.rank === 'A') return card.suit === '♠' ? 60 : 15;
  if (card.rank === '2') return 20;
  if (card.rank === '3') return 30;
  if (card.rank === 'J') return 11;
  if (card.rank === 'Q') return 12;
  if (card.rank === 'K') return 13;
  return Number(card.rank) || 0;
}
const isAction = card => ['2', '3', '7', '8', 'J', 'A', 'JOKER'].includes(card.rank);
const isPenalty = card => ['2', '3', 'JOKER'].includes(card.rank);

const makeDeck = () => SUITS.flatMap(suit => RANKS.map(rank => ({
  id: `${suit}${rank}-${Math.random().toString(36).slice(2, 8)}`,
  suit,
  rank,
}))).concat(
  { id: `joker-a-${Math.random().toString(36).slice(2, 8)}`, suit: '★', rank: 'JOKER' },
  { id: `joker-b-${Math.random().toString(36).slice(2, 8)}`, suit: '★', rank: 'JOKER' },
);

export function shuffle(deck, random = Math.random) {
  const cards = [...deck];
  for (let i = cards.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

export class MatatuGame {
  constructor({ difficulty = 'steady', random = Math.random } = {}) {
    this.difficulty = difficulty;
    this.random = random;
    this.round = 0;
    this.state = this.#emptyState();
  }

  #emptyState() {
    return {
      status: 'idle',
      hands: { player: [], ai: [] },
      drawPile: [],
      discardPile: [],
      activeSuit: '♠',
      cutSuit: '♠',
      currentPlayer: 'player',
      penalty: 0,
      drawnCardId: null,
      mustCallMatatu: false,
      winner: null,
      cut: false,
      message: '',
    };
  }

  start() {
    const cards = shuffle(makeDeck(), this.random);
    const player = cards.splice(0, 7);
    const ai = cards.splice(0, 7);
    let opening = cards.pop();
    while (isAction(opening)) {
      cards.unshift(opening);
      opening = cards.pop();
    }
    this.round += 1;
    this.state = {
      ...this.#emptyState(),
      status: 'playing',
      hands: { player, ai },
      drawPile: cards,
      discardPile: [opening],
      activeSuit: opening.suit,
      cutSuit: SUITS[Math.floor(this.random() * SUITS.length)],
      currentPlayer: 'player',
      message: 'Your turn. Match the suit or rank.',
    };
    return this.state;
  }

  canPlay(card, player = this.state.currentPlayer) {
    if (!card || this.state.status !== 'playing') return false;
    if (player !== this.state.currentPlayer) return false;
    if (player === 'player' && this.state.drawnCardId && this.state.drawnCardId !== card.id) return false;
    if (this.state.penalty > 0) return isPenalty(card) || (card.rank === 'A' && card.suit === '♠');
    const top = this.state.discardPile.at(-1);
    return card.rank === 'JOKER' || card.rank === 'A' || card.suit === this.state.activeSuit || card.rank === top.rank;
  }

  playableCards(player = this.state.currentPlayer) {
    return this.state.hands[player].filter(card => this.canPlay(card, player));
  }

  points(player) { return this.state.hands[player].reduce((sum, card) => sum + cardPoints(card), 0); }

  canCut(player = this.state.currentPlayer) {
    const cutter = this.state.hands[player].find(card => card.rank === '7' && card.suit === this.state.cutSuit);
    return this.state.status === 'playing' && player === this.state.currentPlayer && !this.state.penalty
      && Boolean(cutter) && this.points(player) - cardPoints(cutter) <= CUT_LIMIT;
  }

  cut(player = this.state.currentPlayer) {
    if (!this.canCut(player)) return { ok: false, reason: 'cannot-cut' };
    const hand = this.state.hands[player];
    const sevenIndex = hand.findIndex(card => card.rank === '7' && card.suit === this.state.cutSuit);
    hand.splice(sevenIndex, 1);
    const totals = { player: this.points('player'), ai: this.points('ai') };
    const winner = totals.player === totals.ai ? OPPONENT[player] : totals.player < totals.ai ? 'player' : 'ai';
    this.state.status = 'finished'; this.state.winner = winner; this.state.currentPlayer = null; this.state.cut = true;
    this.state.mustCallMatatu = false;
    this.state.message = `${player === 'player' ? 'You' : 'Nile AI'} cut the game.`;
    return { ok: true, finished: true, winner, cut: true, cutter: player, totals };
  }

  play(cardId, { player = this.state.currentPlayer, suit } = {}) {
    const card = this.state.hands[player].find(item => item.id === cardId);
    if (!this.canPlay(card, player)) return { ok: false, reason: 'illegal' };
    if (['A', 'JOKER'].includes(card.rank) && !SUITS.includes(suit)) return { ok: false, reason: 'choose-suit' };

    const hand = this.state.hands[player];
    hand.splice(hand.findIndex(item => item.id === card.id), 1);
    this.state.discardPile.push(card);
    this.state.drawnCardId = null;
    const blockedPenalty = this.state.penalty > 0 && card.rank === 'A' && card.suit === '♠';
    if (blockedPenalty) this.state.penalty = 0;
    if (card.rank === 'JOKER') this.state.penalty += 5;
    this.state.activeSuit = ['A', 'JOKER'].includes(card.rank) ? suit : card.suit;
    this.state.mustCallMatatu = false;

    if (card.rank === '2' || card.rank === '3') this.state.penalty += Number(card.rank);
    const effect = card.rank === '2' || card.rank === '3'
      ? `+${card.rank} pickup`
      : card.rank === 'JOKER'
        ? '+5 pickup'
        : card.rank === '8' || card.rank === 'J'
          ? 'skip'
          : card.rank === 'A'
            ? `choose · ${SUIT_NAMES[suit]}`
          : '';

    if (hand.length === 0) {
      this.state.status = 'finished';
      this.state.winner = player;
      this.state.currentPlayer = null;
      this.state.message = player === 'player' ? 'You won the round!' : 'Nile AI won this round.';
      return { ok: true, card, effect, finished: true, winner: player };
    }

    // With two players, an 8 skips the opponent and grants another move.
    this.state.currentPlayer = ['8', 'J'].includes(card.rank) ? player : OPPONENT[player];
    if (player === 'player' && hand.length === 1) this.state.mustCallMatatu = true;
    this.state.message = this.state.currentPlayer === 'player'
      ? (card.rank === '8' ? '8 skips Nile AI. Play again.' : 'Your turn.')
      : (this.state.penalty ? `Nile AI must draw or stack ${this.state.penalty}.` : 'Nile AI is thinking.');
    return { ok: true, card, effect, finished: false, nextPlayer: this.state.currentPlayer, mustCallMatatu: this.state.mustCallMatatu };
  }

  callMatatu() {
    if (!this.state.mustCallMatatu || this.state.hands.player.length !== 1) return false;
    this.state.mustCallMatatu = false;
    this.state.message = 'Matatu! Nice call.';
    return true;
  }

  missMatatu() {
    if (!this.state.mustCallMatatu || this.state.hands.player.length !== 1) return false;
    this.state.hands.player.push(...this.#drawCards(2));
    this.state.mustCallMatatu = false;
    this.state.message = 'Matatu missed. Two cards added.';
    return true;
  }

  draw(player = this.state.currentPlayer) {
    if (this.state.status !== 'playing' || player !== this.state.currentPlayer) return { ok: false, reason: 'not-turn' };
    if (player === 'player' && this.state.drawnCardId) return { ok: false, reason: 'already-drew' };

    const existing = this.playableCards(player);
    if (this.state.penalty === 0 && existing.length) return { ok: false, reason: 'must-play' };

    const amount = this.state.penalty || 1;
    const drawn = this.#drawCards(amount);
    this.state.hands[player].push(...drawn);
    const penalty = this.state.penalty;
    this.state.penalty = 0;
    this.state.mustCallMatatu = false;

    if (penalty > 0) {
      this.state.drawnCardId = null;
      this.state.currentPlayer = OPPONENT[player];
      this.state.message = `${player === 'player' ? 'You' : 'Nile AI'} picked up ${drawn.length} cards.`;
      return { ok: true, cards: drawn, penalty, passed: true };
    }

    this.state.drawnCardId = drawn[0]?.id || null;
    if (!drawn.length) {
      this.state.currentPlayer = OPPONENT[player];
      this.state.message = 'No cards left to draw. Turn passed.';
      return { ok: true, cards: [], penalty: 0, passed: true };
    }
    this.state.message = drawn.length ? 'Drawn. Play it if you can, or end your turn.' : 'The draw pile is empty.';
    return { ok: true, cards: drawn, penalty: 0, passed: false };
  }

  pass() {
    if (this.state.status !== 'playing' || this.state.currentPlayer !== 'player' || !this.state.drawnCardId) {
      return { ok: false, reason: 'cannot-pass' };
    }
    const drawn = this.state.hands.player.find(card => card.id === this.state.drawnCardId);
    if (this.canPlay(drawn, 'player')) return { ok: false, reason: 'must-play-drawn-card' };
    this.state.drawnCardId = null;
    this.state.currentPlayer = 'ai';
    this.state.message = 'Your turn is over. Nile AI is thinking.';
    return { ok: true, nextPlayer: 'ai' };
  }

  aiMove() {
    if (this.state.status !== 'playing' || this.state.currentPlayer !== 'ai') return { ok: false, reason: 'not-ai-turn' };
    if (this.canCut('ai')) return this.cut('ai');
    const choices = this.playableCards('ai');
    if (choices.length) {
      const chosen = this.#chooseAiCard(choices);
      const suit = ['A', 'JOKER'].includes(chosen.rank) ? this.#chooseAiSuit() : undefined;
      return this.play(chosen.id, { player: 'ai', suit });
    }
    const result = this.draw('ai');
    if (!result.ok || result.passed) return result;
    if (!result.cards.length) {
      this.state.currentPlayer = 'player';
      this.state.message = 'No cards left to draw. Your turn.';
      return { ok: true, cards: [], passed: true };
    }
    const drawn = result.cards[0];
    if (this.canPlay(drawn, 'ai')) {
      const suit = ['A', 'JOKER'].includes(drawn.rank) ? this.#chooseAiSuit() : undefined;
      return this.play(drawn.id, { player: 'ai', suit });
    }
    this.state.drawnCardId = null;
    this.state.currentPlayer = 'player';
    this.state.message = 'Nile AI drew a card. Your turn.';
    return { ok: true, cards: result.cards, passed: true };
  }

  #chooseAiCard(choices) {
    const scored = choices.map(card => {
      const sameSuit = this.state.hands.ai.filter(item => item.suit === card.suit).length;
      const special = { '2': 5, '3': 6, '8': 3, J: 3, A: 4, JOKER: 7 }[card.rank] || 0;
      const difficultyBonus = this.difficulty === 'sharp' ? sameSuit * 1.8 : this.difficulty === 'casual' ? sameSuit * 0.45 : sameSuit;
      return { card, score: special + difficultyBonus + (card.suit === this.state.activeSuit ? 1 : 0) + this.random() * (this.difficulty === 'casual' ? 5 : 1) };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored[0].card;
  }

  #chooseAiSuit() {
    const counts = SUITS.map(suit => ({ suit, count: this.state.hands.ai.filter(card => card.suit === suit).length }));
    counts.sort((a, b) => b.count - a.count);
    return counts[0].suit;
  }

  #drawCards(amount) {
    const cards = [];
    for (let i = 0; i < amount; i += 1) {
      if (!this.state.drawPile.length) this.#recycleDiscard();
      const card = this.state.drawPile.pop();
      if (card) cards.push(card);
    }
    return cards;
  }

  #recycleDiscard() {
    if (this.state.discardPile.length < 2) return;
    const top = this.state.discardPile.pop();
    this.state.drawPile = shuffle(this.state.discardPile, this.random);
    this.state.discardPile = [top];
  }
}

export function cardEffect(rank) {
  return ({ '2': 'PICK UP 2', '3': 'PICK UP 3', '7': 'CUT', '8': 'SKIP', J: 'SKIP', A: 'CHOOSE SUIT', JOKER: 'PICK UP 5' })[rank] || '';
}

