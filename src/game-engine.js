export const SUITS = Object.freeze(['♠', '♥', '♣', '♦']);
export const SUIT_NAMES = Object.freeze({ '♠': 'Spades', '♥': 'Hearts', '♣': 'Clubs', '♦': 'Diamonds' });
export const CUT_LIMIT = 25;
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const other = player => player === 'player' ? 'ai' : 'player';
export function cardPoints(card) {
  if (card.rank === 'JOKER') return 50;
  if (card.rank === 'A') return card.suit === '♠' ? 60 : 15;
  return ({ '2': 20, '3': 30, J: 11, Q: 12, K: 13 })[card.rank] ?? Number(card.rank);
}
export function shuffle(deck, random = Math.random) {
  const cards = [...deck];
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}
export class MatatuGame {
  constructor({ mode = 'classic', difficulty = 'steady', random = Math.random } = {}) {
    this.mode = mode;
    this.difficulty = difficulty;
    this.random = random;
    this.round = 0;
    this.state = { status: 'idle', hands: { player: [], ai: [] } };
  }
  start() {
    const deck = SUITS.flatMap(suit => RANKS.map(rank => ({ rank, suit, id: `${rank}${suit}` })));
    if (this.mode === 'joker') deck.push({ rank: 'JOKER', suit: '★', id: 'joker-1' }, { rank: 'JOKER', suit: '★', id: 'joker-2' });
    const cards = shuffle(deck, this.random);
    const hands = { player: cards.splice(0, 7), ai: cards.splice(0, 7) };
    let opening = cards.pop();
    while (['A', '2', '7', '8', 'J', 'JOKER'].includes(opening.rank)) {
      cards.unshift(opening);
      opening = cards.pop();
    }
    this.round++;
    this.state = { status: 'playing', hands, drawPile: cards, discardPile: [opening],
      activeSuit: opening.suit, cutSuit: cards[0].suit === '★' ? opening.suit : cards[0].suit,
      currentPlayer: 'player', penalty: 0, drawnCardId: null, winner: null, cut: false,
      cutTotals: null, consecutivePasses: 0 };
    return this.state;
  }
  canPlay(card, player = this.state.currentPlayer) {
    const s = this.state;
    if (!card || s.status !== 'playing' || player !== s.currentPlayer) return false;
    if (s.drawnCardId && s.drawnCardId !== card.id) return false;
    if (s.penalty) return card.rank === '2' || (this.mode === 'joker' && card.rank === 'JOKER');
    return ['A', 'JOKER'].includes(card.rank) || card.suit === s.activeSuit || card.rank === s.discardPile.at(-1).rank;
  }
  playableCards(player = this.state.currentPlayer) {
    return this.state.hands[player]?.filter(card => this.canPlay(card, player)) || [];
  }
  points(player) { return this.state.hands[player].reduce((sum, card) => sum + cardPoints(card), 0); }
  canCut(player = this.state.currentPlayer) {
    const seven = this.state.hands[player]?.find(card => card.rank === '7' && card.suit === this.state.cutSuit);
    return this.state.status === 'playing' && player === this.state.currentPlayer && !this.state.penalty
      && !this.state.drawnCardId && Boolean(seven) && this.points(player) - 7 < CUT_LIMIT;
  }
  cut(player = this.state.currentPlayer) {
    if (!this.canCut(player)) return { ok: false, reason: 'cannot-cut' };
    const hand = this.state.hands[player];
    const [seven] = hand.splice(hand.findIndex(card => card.rank === '7' && card.suit === this.state.cutSuit), 1);
    this.state.discardPile.push(seven);
    this.state.cut = true;
    const totals = { player: this.points('player'), ai: this.points('ai') };
    const winner = totals.player === totals.ai ? other(player) : totals.player < totals.ai ? 'player' : 'ai';
    this.state.cutTotals = totals;
    this.finish(winner);
    return { ok: true, finished: true, winner, cut: true, cutter: player, totals };
  }
  finish(winner) { this.state.status = 'finished'; this.state.winner = winner; this.state.currentPlayer = null; }
  play(cardId, { player = this.state.currentPlayer, suit } = {}) {
    const s = this.state;
    const card = s.hands[player]?.find(item => item.id === cardId);
    if (!this.canPlay(card, player)) return { ok: false, reason: 'illegal' };
    if (['A', 'JOKER'].includes(card.rank) && !SUITS.includes(suit)) return { ok: false, reason: 'choose-suit' };
    const hand = s.hands[player];
    hand.splice(hand.indexOf(card), 1);
    s.discardPile.push(card);
    s.drawnCardId = null;
    s.consecutivePasses = 0;
    s.activeSuit = ['A', 'JOKER'].includes(card.rank) ? suit : card.suit;
    if (card.rank === '2') s.penalty += 2;
    if (card.rank === 'JOKER') s.penalty += 5;
    if (!hand.length) {
      this.finish(player);
      return { ok: true, card, finished: true, winner: player };
    }
    s.currentPlayer = ['8', 'J'].includes(card.rank) ? player : other(player);
    return { ok: true, card, nextPlayer: s.currentPlayer };
  }
  draw(player = this.state.currentPlayer) {
    const s = this.state;
    if (s.status !== 'playing' || player !== s.currentPlayer) return { ok: false, reason: 'not-turn' };
    if (s.drawnCardId) return { ok: false, reason: 'already-drew' };
    if (!s.penalty && this.playableCards(player).length) return { ok: false, reason: 'must-play' };
    const penalty = s.penalty;
    const cards = this.drawCards(penalty || 1);
    s.hands[player].push(...cards);
    s.penalty = 0;
    if (cards.length) s.consecutivePasses = 0;
    if (!penalty && cards.length && this.canPlay(cards[0], player)) {
      s.drawnCardId = cards[0].id;
      return { ok: true, cards, penalty, passed: false };
    }
    s.drawnCardId = null;
    s.currentPlayer = other(player);
    // A depleted deck cannot leave both players passing indefinitely.
    if (!cards.length && ++s.consecutivePasses >= 2) {
      const p = this.points('player'), a = this.points('ai');
      this.finish(p === a ? 'tie' : p < a ? 'player' : 'ai');
      s.blocked = true;
    }
    return { ok: true, cards, penalty, passed: true, finished: s.status === 'finished' };
  }
  pass(player = this.state.currentPlayer) {
    if (this.state.status !== 'playing' || player !== this.state.currentPlayer || !this.state.drawnCardId) return { ok: false, reason: 'cannot-pass' };
    this.state.drawnCardId = null;
    this.state.currentPlayer = other(player);
    return { ok: true, nextPlayer: this.state.currentPlayer };
  }
  aiMove() {
    if (this.state.status !== 'playing' || this.state.currentPlayer !== 'ai') return { ok: false, reason: 'not-ai-turn' };
    if (this.canCut('ai')) return this.cut('ai');
    const choices = this.playableCards('ai');
    if (choices.length) {
      choices.sort((a, b) => this.aiScore(b) - this.aiScore(a));
      const card = choices[0];
      return this.play(card.id, { player: 'ai', suit: this.chooseSuit() });
    }
    const result = this.draw('ai');
    if (!result.ok || result.passed) return result;
    return this.play(result.cards[0].id, { player: 'ai', suit: this.chooseSuit() });
  }
  aiScore(card) { return cardPoints(card) + (['8', 'J'].includes(card.rank) ? 20 : 0); }
  chooseSuit() {
    return [...SUITS].sort((a, b) => this.state.hands.ai.filter(c => c.suit === b).length - this.state.hands.ai.filter(c => c.suit === a).length)[0];
  }
  drawCards(amount) {
    const cards = [];
    for (let i = 0; i < amount; i++) {
      if (!this.state.drawPile.length && this.state.discardPile.length > 1) {
        const top = this.state.discardPile.pop();
        this.state.drawPile = shuffle(this.state.discardPile, this.random);
        this.state.discardPile = [top];
      }
      const card = this.state.drawPile.pop();
      if (card) cards.push(card);
    }
    return cards;
  }
}
export function cardEffect(rank) {
  return ({ '2': '+2', '7': 'CUT', '8': 'SKIP', J: 'SKIP', A: 'SUIT', JOKER: '+5' })[rank] || '';
}
