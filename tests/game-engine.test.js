import test from 'node:test';
import assert from 'node:assert/strict';
import { MatatuGame } from '../src/game-engine.js';

const card = (rank, suit, id = `${rank}${suit}`) => ({ rank, suit, id });
function prepare({ hand, top = card('9', '♠'), activeSuit = top.suit, player = 'player', penalty = 0 } = {}) {
  const game = new MatatuGame();
  game.start();
  Object.assign(game.state, {
    status: 'playing',
    hands: { player: hand, ai: [card('K', '♦', 'ai-card')] },
    drawPile: [card('4', '♣', 'draw-card'), card('6', '♥', 'draw-card-2')],
    discardPile: [top],
    activeSuit,
    currentPlayer: player,
    penalty,
    drawnCardId: null,
    mustCallMatatu: false,
    winner: null,
  });
  return game;
}

test('deals seven cards to each player and starts with a non-action card', () => {
  const game = new MatatuGame();
  game.start();
  assert.equal(game.state.hands.player.length, 7);
  assert.equal(game.state.hands.ai.length, 7);
  assert.equal(game.state.drawPile.length, 39);
  assert.ok(!['2', '3', '7', '8', 'J', 'A', 'JOKER'].includes(game.state.discardPile[0].rank));
});

test('matches a suit or rank; Jack is not a wild card', () => {
  const game = prepare({ hand: [card('4', '♠'), card('9', '♥'), card('J', '♦')] });
  assert.equal(game.canPlay(game.state.hands.player[0]), true);
  assert.equal(game.canPlay(game.state.hands.player[1]), true);
  assert.equal(game.canPlay(game.state.hands.player[2]), false);
  assert.equal(game.canPlay(card('5', '♥')), false);
});

test('Ace requires a suit choice and changes the active suit', () => {
  const game = prepare({ hand: [card('A', '♦', 'wild-ace'), card('5', '♣', 'extra')] });
  assert.deepEqual(game.play('wild-ace'), { ok: false, reason: 'choose-suit' });
  const result = game.play('wild-ace', { suit: '♣' });
  assert.equal(result.ok, true);
  assert.equal(game.state.activeSuit, '♣');
  assert.equal(game.state.currentPlayer, 'ai');
});
test('Joker stacks five pickup cards and lets the player choose suit', () => {
  const game = prepare({ hand: [card('2', '♥', 'two'), card('JOKER', '★', 'joker'), card('5', '♣', 'extra')], top: card('Q', '♦'), activeSuit: '♥' });
  game.play('two');
  game.state.currentPlayer = 'player';
  const result = game.play('joker', { suit: '♣' });
  assert.equal(result.ok, true);
  assert.equal(game.state.penalty, 7);
  assert.equal(game.state.activeSuit, '♣');
});
test('eligible seven cuts and lowest hand points win', () => {
  const game = prepare({ hand: [card('7', '♣', 'cutter'), card('5', '♥', 'five')], top: card('9', '♠') });
  game.state.cutSuit = '♣';
  game.state.hands.ai = [card('K', '♦', 'ai-king')];
  assert.equal(game.canCut('player'), true);
  const result = game.cut('player');
  assert.equal(result.finished, true);
  assert.equal(result.winner, 'player');
  assert.deepEqual(result.totals, { player: 12, ai: 13 });
});
test('cut is rejected when the hand exceeds the limit', () => {
  const game = prepare({ hand: [card('7', '♣', 'cutter'), card('A', '♠', 'ace')], top: card('9', '♠') });
  game.state.cutSuit = '♣';
  assert.equal(game.canCut('player'), false);
  assert.deepEqual(game.cut('player'), { ok: false, reason: 'cannot-cut' });
});

test('2 and 3 add to the pickup penalty and can be stacked', () => {
  const game = prepare({ hand: [card('2', '♥', 'two'), card('3', '♣', 'three'), card('4', '♣', 'extra')], top: card('Q', '♦'), activeSuit: '♥' });
  game.play('two');
  assert.equal(game.state.penalty, 2);
  assert.equal(game.state.currentPlayer, 'ai');
  game.state.currentPlayer = 'player';
  assert.equal(game.canPlay(game.state.hands.player[0]), true);
  game.play('three');
  assert.equal(game.state.penalty, 5);
});

test('8 skips the opponent in a two-player round', () => {
  const game = prepare({ hand: [card('8', '♠', 'eight'), card('5', '♦', 'extra')] });
  game.play('eight');
  assert.equal(game.state.currentPlayer, 'player');
});

test('a player may draw one card and must pass if it cannot be played', () => {
  const game = prepare({ hand: [card('5', '♦', 'five')], top: card('9', '♠'), activeSuit: '♠' });
  game.state.drawPile = [card('4', '♣', 'not-playable')];
  const result = game.draw();
  assert.equal(result.cards.length, 1);
  assert.equal(game.state.drawnCardId, 'not-playable');
  assert.deepEqual(game.pass(), { ok: true, nextPlayer: 'ai' });
  assert.equal(game.state.currentPlayer, 'ai');
});

test('Matatu must be called, otherwise two cards are added', () => {
  const game = prepare({ hand: [card('5', '♠', 'last-card'), card('3', '♦', 'one-before-last')], top: card('3', '♣'), activeSuit: '♣' });
  game.play('one-before-last');
  assert.equal(game.state.mustCallMatatu, true);
  assert.equal(game.missMatatu(), true);
  assert.equal(game.state.hands.player.length, 3);
  assert.equal(game.state.mustCallMatatu, false);
});

test('playing the final card ends the round and records the winner', () => {
  const game = prepare({ hand: [card('9', '♠', 'last')] });
  const result = game.play('last');
  assert.equal(result.finished, true);
  assert.equal(game.state.status, 'finished');
  assert.equal(game.state.winner, 'player');
});

