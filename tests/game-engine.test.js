import test from 'node:test';
import assert from 'node:assert/strict';
import { MatatuGame, cardPoints } from '../src/game-engine.js';
const card = (rank, suit, id = `${rank}${suit}`) => ({ rank, suit, id });
function prepare({ hand = [], top = card('9', '♠'), mode = 'classic', penalty = 0, player = 'player' } = {}) {
  const game = new MatatuGame({ mode });
  game.start();
  Object.assign(game.state, { status: 'playing', hands: { player: hand, ai: [card('K', '♦')] },
    drawPile: [card('4', '♣'), card('6', '♥')], discardPile: [top], activeSuit: top.suit,
    cutSuit: '♣', currentPlayer: player, penalty, drawnCardId: null, winner: null });
  return game;
}
test('Classic has 52 unique cards; Joker mode has 54', () => {
  for (const [mode, size] of [['classic',52],['joker',54]]) {
    const g = new MatatuGame({ mode }); g.start();
    assert.equal(g.state.hands.player.length, 7); assert.equal(g.state.hands.ai.length, 7);
    const all = [...g.state.hands.player,...g.state.hands.ai,...g.state.drawPile,...g.state.discardPile];
    assert.equal(all.length, size); assert.equal(new Set(all.map(c => c.id)).size,size);
    assert.ok(!['2','7','8','J','A','JOKER'].includes(g.state.discardPile[0].rank));
  }
});
test('the cut suit comes from the card under the deck', () => {
  const g = new MatatuGame(); g.start(); assert.equal(g.state.cutSuit,g.state.drawPile[0].suit);
});
test('match suit or rank; a Jack is not wild', () => {
  const g = prepare({ hand:[card('4','♠'),card('9','♥'),card('J','♦')] });
  assert.equal(g.canPlay(g.state.hands.player[0]),true); assert.equal(g.canPlay(g.state.hands.player[1]),true);
  assert.equal(g.canPlay(g.state.hands.player[2]),false);
});
test('an Ace requires a suit choice and changes suit', () => {
  const g = prepare({ hand:[card('A','♦'),card('5','♣')] });
  assert.equal(g.play('A♦').reason,'choose-suit');
  assert.equal(g.play('A♦',{suit:'♥'}).ok,true); assert.equal(g.state.activeSuit,'♥');
});
test('2s stack and a 3 is an ordinary card', () => {
  const g = prepare({ hand:[card('2','♠'),card('2','♥'),card('3','♣'),card('A','♠')] });
  g.play('2♠'); g.state.currentPlayer='player';
  assert.equal(g.canPlay(card('3','♣')),false); assert.equal(g.canPlay(card('A','♠')),false);
  g.play('2♥'); assert.equal(g.state.penalty,4);
  g.state.currentPlayer='player'; const r=g.draw(); assert.equal(r.penalty,4); assert.equal(g.state.currentPlayer,'ai');
  const normal=prepare({hand:[card('3','♠'),card('4','♦')]}); normal.play('3♠'); assert.equal(normal.state.penalty,0);
});
test('Joker mode adds five pickup cards and chooses a suit', () => {
  const g = prepare({mode:'joker',penalty:2,hand:[card('JOKER','★'),card('4','♣')]});
  assert.equal(g.play('JOKER★',{suit:'♦'}).ok,true); assert.equal(g.state.penalty,7); assert.equal(g.state.activeSuit,'♦');
});
test('8 and Jack retain the turn', () => {
  for (const rank of ['8','J']) { const g=prepare({hand:[card(rank,'♠'),card('4','♦')]}); g.play(`${rank}♠`); assert.equal(g.state.currentPlayer,'player'); }
});
test('cut lays the seven down before scoring; a tie favors the opponent', () => {
  const g=prepare({hand:[card('7','♣'),card('5','♥')]});
  g.state.hands.ai=[card('5','♦')]; const r=g.cut();
  assert.equal(r.winner,'ai'); assert.deepEqual(r.totals,{player:5,ai:5}); assert.equal(g.state.discardPile.at(-1).rank,'7');
});
test('cut needs the designated seven and fewer than 25 remaining points', () => {
  for (const [hand, expected] of [
    [[card('7','♣'),card('2','♥'),card('4','♦')],true],
    [[card('7','♣'),card('2','♥'),card('5','♦')],false],
    [[card('7','♦'),card('4','♣')],false],
  ]) assert.equal(prepare({hand}).canCut(),expected);
  const g=prepare({hand:[card('7','♣'),card('4','♦')],penalty:2}); assert.equal(g.canCut(),false);
});
test('non-matching draw automatically ends the turn', () => {
  const g=prepare({hand:[card('5','♦')]}); const r=g.draw();
  assert.equal(r.passed,true); assert.equal(g.state.currentPlayer,'ai'); assert.equal(g.state.drawnCardId,null);
});
test('a matching draw may be played or passed as the reference help states', () => {
  const g=prepare({hand:[card('5','♦')]}); g.state.drawPile=[card('4','♠')];
  assert.equal(g.draw().passed,false); assert.equal(g.canPlay(card('4','♠')),true);
  assert.equal(g.pass().ok,true); assert.equal(g.state.currentPlayer,'ai');
});
test('draw restriction works for either local human player', () => {
  const g=prepare({hand:[card('5','♦')],player:'ai'}); g.state.hands.ai=[card('5','♦','second-player')];
  g.state.drawPile=[card('4','♠')]; g.draw('ai');
  assert.equal(g.draw('ai').reason,'already-drew'); assert.equal(g.canPlay(card('9','♥'),'ai'),false);
  assert.equal(g.play('4♠',{player:'ai'}).ok,true); assert.equal(g.state.currentPlayer,'player');
});
test('playing the last card wins without a timed call', () => {
  const g=prepare({hand:[card('9','♦')]}); const r=g.play('9♦'); assert.equal(r.finished,true); assert.equal(g.state.winner,'player');
});
test('AI handles a newly drawn Ace with a suit choice', () => {
  const g=prepare({player:'ai'}); g.state.hands.ai=[card('4','♦')]; g.state.drawPile=[card('A','♥')];
  const r=g.aiMove(); assert.equal(r.ok,true); assert.equal(r.card.rank,'A'); assert.equal(g.state.currentPlayer,'player');
});
test('recycling preserves the table card and does not duplicate cards', () => {
  const g=prepare({hand:[card('5','♦')]}); g.state.drawPile=[];
  g.state.discardPile=[card('4','♥'),card('6','♣'),card('9','♠')];
  g.draw(); assert.equal(g.state.discardPile.length,1); assert.equal(g.state.discardPile[0].id,'9♠');
  assert.equal(new Set([...g.state.hands.player,...g.state.drawPile,...g.state.discardPile].map(c=>c.id)).size,4);
});
test('no playable cards and no recyclable deck resolves a stalemate', () => {
  const g=prepare({hand:[card('5','♦')]}); g.state.hands.ai=[card('6','♥')]; g.state.drawPile=[];
  g.draw(); g.draw('ai'); assert.equal(g.state.status,'finished'); assert.equal(g.state.winner,'player');
});
test('cut scoring uses the card values displayed in help', () => {
  assert.equal(cardPoints(card('A','♠')),60); assert.equal(cardPoints(card('A','♥')),15);
  assert.equal(cardPoints(card('2','♥')),20); assert.equal(cardPoints(card('3','♥')),30);
  assert.equal(cardPoints(card('J','♥')),11); assert.equal(cardPoints(card('JOKER','★')),50);
});
