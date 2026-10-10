export const SUITS = Object.freeze(['♠', '♥', '♣', '♦']);
export const SUIT_NAMES = Object.freeze({ '♠': 'Spades', '♥': 'Hearts', '♣': 'Clubs', '♦': 'Diamonds' });
const RANKS = Object.freeze(['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']);
const OPPONENT = Object.freeze({ player: 'ai', ai: 'player' });

const makeDeck = () => SUITS.flatMap(suit => RANKS.map(rank => ({
  id: `${suit}${rank}-${Math.random().toString(36).slice(2, 8)}`,
  suit,
  rank,
})));

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
      currentPlayer: 'player',
      penalty: 0,
      drawnCardId: null,
      mustCallMatatu: false,
      winner: null,
      message: '',
    };
  }

  start() {
    const cards = shuffle(makeDeck(), this.random);
    const player = cards.splice(0, 7);
    const ai = cards.splice(0, 7);
    let opening = cards.pop();
    while (['2', '3', '8', 'J'].includes(opening.rank)) {
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
      currentPlayer: 'player',
      message: 'Your turn. Match the suit or rank.',
    };
    return this.state;
  }

  canPlay(card, player = this.state.currentPlayer) {
    if (!card || this.state.status !== 'playing') return false;
    if (player !== this.state.currentPlayer) return false;
    if (player === 'player' && this.state.drawnCardId && this.state.drawnCardId !== card.id) return false;
    if (this.state.penalty > 0) return card.rank === '2' || card.rank === '3';
    const top = this.state.discardPile.at(-1);
    return card.rank === 'J' || card.suit === this.state.activeSuit || card.rank === top.rank;
  }

  playableCards(player = this.state.currentPlayer) {
    return this.state.hands[player].filter(card => this.canPlay(card, player));
  }

  play(cardId, { player = this.state.currentPlayer, suit } = {}) {
    const card = this.state.hands[player].find(item => item.id === cardId);
    if (!this.canPlay(card, player)) return { ok: false, reason: 'illegal' };
    if (card.rank === 'J' && !SUITS.includes(suit)) return { ok: false, reason: 'choose-suit' };

    const hand = this.state.hands[player];
    hand.splice(hand.findIndex(item => item.id === card.id), 1);
    this.state.discardPile.push(card);
    this.state.drawnCardId = null;
    this.state.activeSuit = card.rank === 'J' ? suit : card.suit;
    this.state.mustCallMatatu = false;

    if (card.rank === '2' || card.rank === '3') this.state.penalty += Number(card.rank);
    const effect = card.rank === '2' || card.rank === '3'
      ? `+${card.rank} pickup`
      : card.rank === '8'
        ? 'skip'
        : card.rank === 'J'
          ? `wild · ${SUIT_NAMES[suit]}`
          : '';

    if (hand.length === 0) {
      this.state.status = 'finished';
      this.state.winner = player;
      this.state.currentPlayer = null;
      this.state.message = player === 'player' ? 'You won the round!' : 'Nile AI won this round.';
      return { ok: true, card, effect, finished: true, winner: player };
    }

    // With two players, an 8 skips the opponent and grants another move.
    this.state.currentPlayer = card.rank === '8' ? player : OPPONENT[player];
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
    const choices = this.playableCards('ai');
    if (choices.length) {
      const chosen = this.#chooseAiCard(choices);
      const suit = chosen.rank === 'J' ? this.#chooseAiSuit() : undefined;
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
      const suit = drawn.rank === 'J' ? this.#chooseAiSuit() : undefined;
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
      const special = { '2': 5, '3': 6, '8': 3, J: 4 }[card.rank] || 0;
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
  return ({ '2': 'PICK UP 2', '3': 'PICK UP 3', '8': 'SKIP', J: 'WILD SUIT' })[rank] || '';
}
