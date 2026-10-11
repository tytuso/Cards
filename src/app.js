import { MatatuGame, SUITS, SUIT_NAMES, cardEffect } from './game-engine.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const storageKey = 'nile-cards-profile-v1';
const defaults = { games: 0, wins: 0, losses: 0, currentStreak: 0, bestStreak: 0, sound: true, difficulty: 'steady' };
let profile = readProfile();
let game = null;
let selectedDifficulty = profile.difficulty;
let toastTimer = 0;
let matatuTimer = 0;
let matatuInterval = 0;
let matchRecorded = 0;
let pendingJack = null;
let audioContext = null;

function readProfile() {
  try { return { ...defaults, ...JSON.parse(localStorage.getItem(storageKey) || '{}') }; }
  catch { return { ...defaults }; }
}
function saveProfile() { localStorage.setItem(storageKey, JSON.stringify(profile)); }
function suitColor(suit) { return suit === '♥' || suit === '♦' ? 'red' : 'black'; }

function cardMarkup(card, { hand = false, playable = false, drawn = false } = {}) {
  const effect = cardEffect(card.rank);
  const isJoker = card.rank === 'JOKER';
  const label = isJoker ? 'Joker' : `${card.rank} of ${SUIT_NAMES[card.suit]}`;
  const face = isJoker ? '★' : card.rank;
  const tag = effect ? `<span class="card-effect">${effect}</span>` : '';
  const corner = `<span class="pc-corner">${face}<br><small>${isJoker ? 'WILD' : card.suit}</small></span>`;
  if (!hand) return `<div class="playing-card ${suitColor(card.suit)} ${isJoker ? 'joker-card' : ''}" aria-label="${label}">${corner}<span class="pc-suit">${isJoker ? '★' : card.suit}</span>${tag}<span class="pc-corner pc-bottom">${face}<br><small>${isJoker ? 'WILD' : card.suit}</small></span></div>`;
  return `<button class="hand-card ${suitColor(card.suit)} ${isJoker ? 'joker-card' : ''} ${playable ? 'is-playable' : ''} ${drawn ? 'is-drawn' : ''}" data-action="play-card" data-card-id="${card.id}" role="listitem" aria-label="${label}${effect ? `, ${effect.toLowerCase()}` : ''}" ${playable ? '' : 'disabled'}>${corner}<span class="pc-suit">${isJoker ? '★' : card.suit}</span>${tag}<span class="pc-corner pc-bottom">${face}<br><small>${isJoker ? 'WILD' : card.suit}</small></span></button>`;
}

function setScreen(which) {
  $('#home-screen').hidden = which !== 'home';
  $('#game-screen').hidden = which !== 'game';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function refreshHome() {
  $('#stat-wins').textContent = profile.wins;
  $('#stat-streak').textContent = profile.bestStreak;
  $('#stat-games').textContent = profile.games;
  $('#sound-icon').textContent = profile.sound ? '♫' : '♩̸';
}

function openModal(markup) {
  $('#dialog').innerHTML = markup;
  $('#overlay').hidden = false;
  const close = $('.dialog-close');
  if (close) close.focus();
}
function closeModal() { $('#overlay').hidden = true; }

function setupDialog() {
  selectedDifficulty = profile.difficulty;
  openModal(`<button class="dialog-close" data-action="close-dialog" aria-label="Close">×</button>
    <div class="dialog-kicker">YOUR TABLE IS READY</div><h2 id="dialog-title">Choose your opponent.</h2>
    <p class="dialog-intro">Pick a pace for this round. You can change it before the next deal.</p>
    <div class="difficulty-picker">
      ${difficultyChoice('casual', 'Casual', 'A relaxed game to learn the flow.')}
      ${difficultyChoice('steady', 'Steady', 'A balanced, thoughtful opponent.')}
      ${difficultyChoice('sharp', 'Sharp', 'Nile AI plays to win.')}
    </div>
    <div class="dialog-actions"><button class="button button-primary" data-action="begin-game">Deal the cards <span class="button-arrow">↗</span></button></div>`);
}
function difficultyChoice(value, title, caption) {
  return `<button class="difficulty-choice ${selectedDifficulty === value ? 'selected' : ''}" data-action="select-difficulty" data-difficulty="${value}" aria-pressed="${selectedDifficulty === value}"><b>${title}</b><small>${caption}</small></button>`;
}

function beginGame() {
  profile.difficulty = selectedDifficulty;
  saveProfile();
  game = new MatatuGame({ difficulty: selectedDifficulty });
  matchRecorded = 0;
  game.start();
  closeModal();
  setScreen('game');
  syncGame();
  toast('Cards are dealt. Make your move.');
}

function syncGame() {
  if (!game) return;
  const s = game.state;
  const isPlayerTurn = s.status === 'playing' && s.currentPlayer === 'player';
  const top = s.discardPile.at(-1);
  $('#ai-count').textContent = `${s.hands.ai.length} card${s.hands.ai.length === 1 ? '' : 's'}`;
  $('#player-count').textContent = `${s.hands.player.length} card${s.hands.player.length === 1 ? '' : 's'}`;
  $('#deck-count').textContent = s.drawPile.length;
  $('#round-number').textContent = String(game.round).padStart(2, '0');
  $('#discard-card').innerHTML = top ? cardMarkup(top) : '';
  $('#active-suit-symbol').textContent = s.activeSuit;
  $('#active-suit-symbol').className = suitColor(s.activeSuit);
  $('#active-suit-name').textContent = SUIT_NAMES[s.activeSuit].toUpperCase();
  $('#cut-suit-symbol').textContent = s.cutSuit;
  $('#match-status').textContent = s.status === 'finished' ? 'ROUND COMPLETE' : isPlayerTurn ? 'YOUR TURN' : 'NILE AI TURN';
  $('#ai-caption').textContent = s.status === 'finished' ? (s.winner === 'ai' ? 'Won this round' : 'Good game') : !isPlayerTurn ? 'Making a move…' : 'Cards facedown';
  $('#player-caption').textContent = s.status === 'finished' ? (s.winner === 'player' ? 'Round winner' : 'Next round?') : isPlayerTurn ? 'Make your move' : 'Waiting on Nile AI';
  $('#hand-total').textContent = s.hands.player.length;

  const playableIds = new Set(game.playableCards('player').map(card => card.id));
  $('#player-hand').innerHTML = s.hands.player.map(card => cardMarkup(card, {
    hand: true,
    playable: isPlayerTurn && playableIds.has(card.id),
    drawn: card.id === s.drawnCardId,
  })).join('');

  const banner = $('#turn-callout');
  if (s.status === 'finished') banner.innerHTML = s.winner === 'player' ? '<b>You got there first. Matatu!</b>' : 'Nile AI wins this round. Deal again?';
  else if (s.penalty) banner.innerHTML = `Pickup penalty: <b>${s.penalty} cards</b> · stack an attack card or draw.`;
  else if (!isPlayerTurn) banner.innerHTML = '<b>Nile AI</b> is deciding its next move.';
  else if (s.drawnCardId) banner.innerHTML = 'You drew a card. Play it if you can, or <b>end your turn.</b>';
  else banner.innerHTML = 'Match the <b>suit or rank</b> to play.';

  const hasPlayable = game.playableCards('player').length > 0;
  const cutButton = $('[data-action="cut"]');
  cutButton.hidden = !game.canCut('player');
  cutButton.textContent = `Cut game · ${game.points('player')} pts`;
  const drawButtons = $$('[data-action="draw"]');
  drawButtons.forEach(button => {
    const penalty = s.penalty;
    button.innerHTML = penalty ? `Take ${penalty} cards <span class="button-arrow">↗</span>` : 'Draw a card <span class="button-arrow">↗</span>';
    button.disabled = !isPlayerTurn || s.status !== 'playing' || Boolean(s.drawnCardId) || (!penalty && hasPlayable);
  });
  $('[data-action="pass"]').hidden = !Boolean(s.drawnCardId) || hasPlayable || !isPlayerTurn || s.status !== 'playing';
  $('[data-action="call-matatu"]').hidden = !s.mustCallMatatu;
  $('[data-action="call-matatu"]').disabled = !s.mustCallMatatu;
  $('#hand-hint').textContent = s.penalty ? 'Stack a 2 or 3, or take the penalty' : s.drawnCardId ? 'Your drawn card is marked' : 'Tap a lit card to play it';

  if (s.mustCallMatatu) startMatatuTimer(); else clearMatatuTimer();
  if (s.status === 'finished') finishMatch();
}

function startMatatuTimer() {
  if (matatuTimer) return;
  let remaining = 4;
  $('[data-action="call-matatu"]').textContent = `Call Matatu! (${remaining}) ✦`;
  matatuInterval = window.setInterval(() => {
    remaining -= 1;
    if (!game?.state.mustCallMatatu || remaining <= 0) {
      clearMatatuTimer();
      if (game?.state.mustCallMatatu && game.missMatatu()) {
        toast('Matatu missed — two cards added.');
        syncGame();
      }
    } else $('[data-action="call-matatu"]').textContent = `Call Matatu! (${remaining}) ✦`;
  }, 1000);
  matatuTimer = 1;
}
function clearMatatuTimer() {
  window.clearInterval(matatuInterval);
  matatuTimer = 0;
  matatuInterval = 0;
}

function handlePlay(cardId, suit) {
  if (!game) return;
  const card = game.state.hands.player.find(item => item.id === cardId);
  if (!card) return;
  if (game.state.mustCallMatatu) {
    toast('Call Matatu before you play your last card.');
    return;
  }
  if (['A', 'JOKER'].includes(card.rank) && !suit) { pendingJack = cardId; suitDialog(card.rank); return; }
  const result = game.play(cardId, { player: 'player', suit });
  if (!result.ok) return;
  clearMatatuTimer();
  playSound('play');
  if (result.effect) toast(effectMessage(result.card, result.effect));
  syncGame();
  if (result.nextPlayer === 'ai') scheduleAi();
}

function effectMessage(card, effect) {
  if (card.rank === '2' || card.rank === '3') return `You played ${card.rank}. The pickup penalty is now ${game.state.penalty}.`;
  if (card.rank === '8' || card.rank === 'J') return `${card.rank === '8' ? 'Eight' : 'Jack'} skips Nile AI. You keep the turn.`;
  if (card.rank === 'JOKER') return `Joker played. Pickup penalty is now ${game.state.penalty}; ${SUIT_NAMES[game.state.activeSuit]} is in play.`;
  if (card.rank === 'A') return `Ace played. ${SUIT_NAMES[game.state.activeSuit]} is in play.`;
  return `Pickup penalty is now ${game.state.penalty}.`;
}

function scheduleAi() {
  if (!game || game.state.status !== 'playing' || game.state.currentPlayer !== 'ai') return;
  window.setTimeout(() => {
    if (!game || game.state.currentPlayer !== 'ai' || game.state.status !== 'playing') return;
    const result = game.aiMove();
    if (!result.ok) return;
    playSound('soft');
    if (result.cards?.length) toast(result.penalty ? `Nile AI picked up ${result.cards.length} cards.` : 'Nile AI drew a card.');
    else if (['A', 'JOKER'].includes(result.card?.rank)) toast(`Nile AI chose ${SUIT_NAMES[game.state.activeSuit]}.`);
    else if (result.card?.rank === 'J') toast('Jack skips your turn. Nile AI plays again.');
    else if (result.card?.rank === '8') toast('Eight skips your turn. Nile AI plays again.');
    else if (result.card?.rank === '2' || result.card?.rank === '3') toast(`Nile AI stacked a ${result.card.rank}. Pickup penalty: ${game.state.penalty}.`);
    syncGame();
    if (game.state.currentPlayer === 'ai' && game.state.status === 'playing') scheduleAi();
  }, 580);
}

function finishMatch() {
  if (matchRecorded === game.round) return;
  matchRecorded = game.round;
  profile.games += 1;
  if (game.state.winner === 'player') {
    profile.wins += 1;
    profile.currentStreak += 1;
    profile.bestStreak = Math.max(profile.bestStreak, profile.currentStreak);
    playSound('win');
  } else {
    profile.losses += 1;
    profile.currentStreak = 0;
  }
  saveProfile();
  refreshHome();
  const won = game.state.winner === 'player';
  const resultCopy = game.state.cut
    ? `Cut points: You ${game.points('player')} · Nile AI ${game.points('ai')}.`
    : won ? 'You emptied your hand first. That was a sharp round.' : 'Nile AI cleared its hand first this time. Shuffle and take another shot.';
  const resultTitle = game.state.cut ? (won ? 'Cut won!' : 'Cut lost.') : (won ? 'Matatu!' : 'Good game.');
  openModal(`<div class="dialog-kicker">${won ? 'NICE HAND' : 'NEXT ROUND IS YOURS'}</div>
    <h2 id="dialog-title">${resultTitle}</h2>
    <p class="dialog-intro">${resultCopy}</p>
    <div class="result-score">${profile.wins} WIN${profile.wins === 1 ? '' : 'S'} &nbsp;·&nbsp; ${profile.games} GAME${profile.games === 1 ? '' : 'S'} PLAYED</div>
    <div class="dialog-actions"><button class="button button-outline" data-action="home">Home</button><button class="button button-primary" data-action="rematch">Play again <span class="button-arrow">↗</span></button></div>`);
}

function suitDialog(rank = 'A') {
  openModal(`<button class="dialog-close" data-action="close-dialog" aria-label="Close">×</button>
    <div class="dialog-kicker">${rank === 'JOKER' ? 'JOKER · PICK UP FIVE' : 'ACE · CHOOSE THE SUIT'}</div><h2 id="dialog-title">What suit next?</h2>
    <p class="dialog-intro">Choose the suit Nile AI has to follow.</p>
    <div class="suit-grid">${SUITS.map(suit => `<button class="suit-pick ${suitColor(suit)}" data-action="choose-suit" data-suit="${suit}" aria-label="${SUIT_NAMES[suit]}">${suit}</button>`).join('')}</div>`);
}

function rulesDialog() {
  openModal(`<button class="dialog-close" data-action="close-dialog" aria-label="Close">×</button>
    <div class="dialog-kicker">QUICK TABLE GUIDE</div><h2 id="dialog-title">How to play Matatu.</h2>
    <p class="dialog-intro">Clear your hand before Nile AI. Match the suit or rank. Aces choose the next suit; 8s and Jacks skip the opponent.</p>
    <div class="rule-list">
      ${rule('2', 'Pickup two', 'Draw 2 unless you stack a 2, 3, or Joker. The penalty keeps growing.')}
      ${rule('3', 'Pickup three', 'Adds 3 cards to the pickup penalty. Stack another attack card to pass it on.')}
      ${rule('8', 'Skip', 'Nile AI loses its turn; you play again.')}
      ${rule('J', 'Skip', 'A Jack skips Nile AI. You get another turn.')}
                  ${rule('A', 'Choose a suit', 'An Ace can change the suit. Ace of Spades also blocks a pickup penalty.')}
      ${rule('★', 'Joker', 'Choose the next suit and add 5 pickup cards. Stack a 2, 3, or Joker to pass it on.')}
      ${rule('7', 'Cut the game', `Play the 7 of the marked cut suit when your hand is worth ${25} points or less. Lowest points wins.`)}
      ${rule('1', 'Call Matatu', 'When you have one card left, call Matatu within 4 seconds or draw 2.')}
    </div>
    <div class="rule-note">When you cannot play, draw one card. If it fits, play it; otherwise end your turn. A cut uses the 25-point limit and lowest remaining hand score.</div>
    <div class="dialog-actions"><button class="button button-primary" data-action="close-dialog">Got it</button></div>`);
}
function rule(rank, title, copy) {
  const glyph = rank === '1' ? '✦' : rank;
  return `<div class="rule-row"><span class="rule-glyph ${rank === '2' ? 'red' : ''}">${glyph}</span><span class="rule-copy"><b>${title}</b><span>${copy}</span></span></div>`;
}

function statsDialog() {
  const rate = profile.games ? Math.round(profile.wins / profile.games * 100) : 0;
  openModal(`<button class="dialog-close" data-action="close-dialog" aria-label="Close">×</button>
    <div class="dialog-kicker">YOUR TABLE, YOUR RECORD</div><h2 id="dialog-title">A good run.</h2>
    <p class="dialog-intro">Your game history stays on this device.</p>
    <div class="stat-grid"><div class="stat-tile"><b>${profile.games}</b><small>GAMES PLAYED</small></div><div class="stat-tile"><b>${profile.wins}</b><small>WINS</small></div><div class="stat-tile"><b>${rate}%</b><small>WIN RATE</small></div><div class="stat-tile"><b>${profile.bestStreak}</b><small>BEST STREAK</small></div></div>
    <div class="dialog-actions"><button class="button button-outline" data-action="reset-stats">Reset stats</button><button class="button button-primary" data-action="close-dialog">Done</button></div>`);
}

function leaveDialog() {
  openModal(`<button class="dialog-close" data-action="close-dialog" aria-label="Close">×</button><div class="dialog-kicker">PAUSE THIS ROUND</div><h2 id="dialog-title">Head back to the lobby?</h2><p class="dialog-intro">This round won’t count in your record unless it’s finished.</p><div class="dialog-actions"><button class="button button-outline" data-action="close-dialog">Stay here</button><button class="button button-primary" data-action="home">Back to lobby</button></div>`);
}
function newRoundDialog() {
  openModal(`<button class="dialog-close" data-action="close-dialog" aria-label="Close">×</button><div class="dialog-kicker">FRESH DEAL</div><h2 id="dialog-title">Start a new round?</h2><p class="dialog-intro">The current round won’t change your stats. Ready to reshuffle?</p><div class="dialog-actions"><button class="button button-outline" data-action="close-dialog">Keep playing</button><button class="button button-primary" data-action="rematch">Deal again <span class="button-arrow">↗</span></button></div>`);
}

function toast(message) {
  const node = $('#game-toast');
  node.textContent = message;
  node.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { node.hidden = true; }, 2300);
  $('#live-region').textContent = message;
}

function playSound(kind) {
  if (!profile.sound) return;
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === 'suspended') audioContext.resume();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const now = audioContext.currentTime;
    const frequency = kind === 'win' ? 690 : kind === 'play' ? 460 : 320;
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.35, now + (kind === 'win' ? .22 : .08));
    gain.gain.setValueAtTime(.0001, now);
    gain.gain.exponentialRampToValueAtTime(kind === 'win' ? .075 : .045, now + .015);
    gain.gain.exponentialRampToValueAtTime(.0001, now + (kind === 'win' ? .25 : .12));
    oscillator.connect(gain); gain.connect(audioContext.destination); oscillator.start(now); oscillator.stop(now + .27);
  } catch { /* Sound is optional. */ }
}

function toggleSound() {
  profile.sound = !profile.sound;
  saveProfile();
  refreshHome();
  toast(profile.sound ? 'Sound is on.' : 'Sound is off.');
}

function handleClick(event) {
  const target = event.target.closest('[data-action]');
  if (!target) {
    if (event.target === $('#overlay')) closeModal();
    return;
  }
  const action = target.dataset.action;
  if (action === 'start-game') setupDialog();
  else if (action === 'begin-game') beginGame();
  else if (action === 'select-difficulty') {
    selectedDifficulty = target.dataset.difficulty;
    $$('.difficulty-choice').forEach(button => {
      const active = button.dataset.difficulty === selectedDifficulty;
      button.classList.toggle('selected', active);
      button.setAttribute('aria-pressed', String(active));
    });
  } else if (action === 'open-rules') rulesDialog();
  else if (action === 'open-stats') statsDialog();
  else if (action === 'toggle-sound') toggleSound();
  else if (action === 'close-dialog') closeModal();
  else if (action === 'new-game') newRoundDialog();
  else if (action === 'leave-game') leaveDialog();
  else if (action === 'home') { closeModal(); clearMatatuTimer(); game = null; setScreen('home'); refreshHome(); }
  else if (action === 'rematch') beginGame();
  else if (action === 'play-card') handlePlay(target.dataset.cardId);
  else if (action === 'choose-suit') { const cardId = pendingJack; pendingJack = null; closeModal(); handlePlay(cardId, target.dataset.suit); }
  else if (action === 'draw') drawMove();
  else if (action === 'cut') {
    const result = game?.cut('player');
    if (result?.ok) { toast(`Cut! Your ${result.totals.player} points vs Nile AI's ${result.totals.ai}.`); syncGame(); }
    else toast('You need the 7 of the cut suit and 25 points or less to cut.');
  }
  else if (action === 'pass') passMove();
  else if (action === 'call-matatu') {
    if (game?.callMatatu()) { clearMatatuTimer(); playSound('play'); toast('Matatu! Nice call.'); syncGame(); }
  } else if (action === 'reset-stats') {
    profile = { ...defaults, difficulty: profile.difficulty, sound: profile.sound };
    saveProfile(); refreshHome(); statsDialog();
  }
}

function drawMove() {
  if (!game) return;
  const result = game.draw('player');
  if (!result.ok) {
    if (result.reason === 'must-play') toast('You have a playable card.');
    else if (result.reason === 'already-drew') toast('You have already drawn this turn.');
    return;
  }
  playSound('soft');
  if (result.penalty) toast(`You picked up ${result.cards.length} cards.`);
  else toast(result.cards[0] && game.canPlay(result.cards[0], 'player') ? 'A playable card! Tap it to play.' : 'Card drawn. End your turn.');
  syncGame();
  if (result.passed) scheduleAi();
}
function passMove() {
  if (!game) return;
  const result = game.pass();
  if (!result.ok) { if (result.reason === 'must-play-drawn-card') toast('That card is playable. Tap it to use it.'); return; }
  syncGame(); scheduleAi();
}

document.addEventListener('click', handleClick);
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !$('#overlay').hidden) closeModal();
});
$('#overlay').addEventListener('click', event => { if (event.target === $('#overlay')) closeModal(); });
window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  window.installPrompt = event;
});
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
refreshHome();

