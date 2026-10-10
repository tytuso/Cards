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
  assert.equal(game.state.drawPile.length, 37);
  assert.ok(!['2', '3', '8', 'J'].includes(game.state.discardPile[0].rank));
});

test('matches a suit or rank and treats Jack as wild', () => {
  const game = prepare({ hand: [card('4', '♠'), card('9', '♥'), card('J', '♦')] });
  assert.equal(game.canPlay(game.state.hands.player[0]), true);
  assert.equal(game.canPlay(game.state.hands.player[1]), true);
  assert.equal(game.canPlay(game.state.hands.player[2]), true);
  assert.equal(game.canPlay(card('5', '♥')), false);
});

test('a Jack requires a suit choice and changes the active suit', () => {
  const game = prepare({ hand: [card('J', '♦', 'wild-jack'), card('5', '♣', 'extra')] });
  assert.deepEqual(game.play('wild-jack'), { ok: false, reason: 'choose-suit' });
  const result = game.play('wild-jack', { suit: '♣' });
  assert.equal(result.ok, true);
  assert.equal(game.state.activeSuit, '♣');
  assert.equal(game.state.currentPlayer, 'ai');
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
