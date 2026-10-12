import { MatatuGame, SUITS, SUIT_NAMES, cardEffect } from './game-engine.js';
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const key = 'nile-cards-profile-v1';
const defaults = { games: 0, wins: 0, bestStreak: 0, currentStreak: 0, sound: true, theme: 'wood' };
let profile;
try { profile = { ...defaults, ...JSON.parse(localStorage.getItem(key) || '{}') }; } catch { profile = { ...defaults }; }
let game = null, local = false, visiblePlayer = 'player', handHidden = false;
let pendingCard = null, aiTimer = 0, lastMessage = '', recorded = false, audioContext, focusBeforeDialog;
let modalLocked = false, screen = 'home';
function save() { try { localStorage.setItem(key, JSON.stringify(profile)); } catch { /* Play still works without storage. */ } }
function red(suit) { return suit === '♥' || suit === '♦' ? 'red' : ''; }
function name(player) { return local ? player === 'player' ? 'Player 1' : 'Player 2' : player === 'player' ? 'You' : 'Computer'; }
function opposite(player) { return player === 'player' ? 'ai' : 'player'; }
function actor() { return local ? visiblePlayer : 'player'; }
function refreshProfile() {
  document.body.dataset.theme = ['wood', 'green', 'night'].includes(profile.theme) ? profile.theme : 'wood';
  $('#home-wins').textContent = `${profile.wins} win${profile.wins === 1 ? '' : 's'}`;
  $('#sound-button').textContent = profile.sound ? '♫' : '♩';
  $('#sound-button').setAttribute('aria-label', profile.sound ? 'Turn sound off' : 'Turn sound on');
}
function face(card, button = false, playable = false, drawn = false) {
  const joker = card.rank === 'JOKER';
  const rank = joker ? '★' : card.rank, symbol = joker ? '★' : card.suit;
  const label = joker ? 'Joker' : `${card.rank} of ${SUIT_NAMES[card.suit]}`;
  const content = `<span class="corner">${rank}<br><small>${symbol}</small></span><span class="card-suit">${symbol}</span><span class="effect-dot">${cardEffect(card.rank)}</span><span class="corner bottom">${rank}<br><small>${symbol}</small></span>`;
  return button ? `<button class="hand-card ${red(card.suit)} ${playable ? 'is-playable' : ''} ${drawn ? 'is-drawn' : ''}" data-action="play" data-card="${card.id}" aria-label="${label}${playable ? ', playable' : ''}" ${playable ? '' : 'disabled'}>${content}</button>` : `<span class="playing-card ${red(card.suit)}" aria-label="${label}">${content}</span>`;
}
function back() { return '<span class="card-back" aria-hidden="true"><span>✦</span></span>'; }
function setScreen(value) {
  screen = value;
  $('#home-screen').hidden = value !== 'home';
  $('#game-screen').hidden = value !== 'game';
}
function modal(content, locked = false) {
  if ($('#overlay').hidden) focusBeforeDialog = document.activeElement;
  modalLocked = locked;
  $('#dialog').innerHTML = `${locked ? '' : '<button class="dialog-close" data-action="close" aria-label="Close">×</button>'}${content}`;
  $('#overlay').hidden = false;
  $('.board').inert = true;
  $('#dialog').focus();
}
function close(force = false) {
  if (modalLocked && !force) return;
  $('#overlay').hidden = true;
  $('.board').inert = false;
  modalLocked = false;
  pendingCard = null;
  if (game && !local && game.state.status === 'playing' && game.state.currentPlayer === 'ai') scheduleAi();
  if (focusBeforeDialog?.isConnected) focusBeforeDialog.focus();
}
function announce(message) { lastMessage = message; $('#announcer').textContent = message; }
function start(mode = 'classic') {
  clearTimeout(aiTimer);
  close(true);
  local = mode === 'local';
  game = new MatatuGame({ mode: mode === 'joker' ? 'joker' : 'classic' });
  game.start();
  recorded = false; visiblePlayer = 'player'; handHidden = local;
  announce(local ? 'Pass the device to Player 1.' : 'Tap a matching card to play.');
  setScreen('game');
  render();
  if (local) handoff();
}
function render() {
  if (!game) return;
  const s = game.state, who = actor(), opponent = opposite(who);
  const yourTurn = s.status === 'playing' && who === s.currentPlayer && !handHidden;
  const playable = new Set(game.playableCards(who).map(card => card.id));
  $('#mode-label').textContent = local ? '2 players' : game.mode === 'joker' ? 'Joker' : 'Classic';
  $('#opponent-name').textContent = name(opponent);
  $('#opponent-count').textContent = `${s.hands[opponent].length} cards`;
  $('#opponent-hand').innerHTML = s.hands[opponent].slice(0, 16).map(back).join('');
  $('#opponent-hand').setAttribute('aria-label', `${name(opponent)} has ${s.hands[opponent].length} cards face down`);
  $('#discard').innerHTML = face(s.discardPile.at(-1));
  $('#discard').disabled = !yourTurn || !s.drawnCardId;
  $('#player-name').textContent = name(who);
  $('#player-points').textContent = handHidden ? 'Hand hidden' : `${game.points(who)} points`;
  $('#hand-count').textContent = `${s.hands[who].length} cards`;
  $('#player-hand').innerHTML = handHidden ? s.hands[who].map(back).join('') : s.hands[who].map(card => face(card, true, yourTurn && playable.has(card.id), s.drawnCardId === card.id)).join('');
  const width = $('#player-hand').clientWidth;
  const cardWidth = parseFloat(getComputedStyle($('#player-hand')).getPropertyValue('--card-w')) || 76;
  const count = s.hands[who].length;
  const overlap = count > 1 ? Math.min(cardWidth - 30, Math.max(-8, (count * cardWidth - width + 12) / (count - 1))) : -8;
  $('#player-hand').style.setProperty('--overlap', `${overlap}px`);
  $('#player-hand').classList.toggle('crowded', count * cardWidth - Math.max(0, count - 1) * overlap > width - 10);
  $('#cut-mark').textContent = `7${s.cutSuit}`;
  $('#cut-mark').className = red(s.cutSuit);
  $('#suit-mark').textContent = s.activeSuit;
  $('#suit-mark').className = red(s.activeSuit);
  $('#suit-mark').setAttribute('aria-label', `Current suit: ${SUIT_NAMES[s.activeSuit]}`);
  $('#draw-deck').disabled = !yourTurn || Boolean(s.drawnCardId) || (!s.penalty && playable.size > 0);
  $('#draw-label').textContent = s.penalty ? `Pick ${s.penalty} cards` : 'Pick a card';
  $('#draw-deck').setAttribute('aria-label', s.penalty ? `Pick ${s.penalty} penalty cards` : 'Pick a card');
  $('#pass-button').hidden = !yourTurn || !s.drawnCardId;
  $('[data-action="cut"]').hidden = !yourTurn || !game.canCut(who);
  $('#move-message').textContent = s.status === 'finished' ? 'Round finished' : handHidden ? 'Pass the device' : !yourTurn ? `${name(s.currentPlayer)} is playing…` : s.penalty ? `Pick ${s.penalty} cards or play another ${game.mode === 'joker' ? '2 / Joker' : '2'}` : s.drawnCardId ? 'Play the new card or tap the table to pass' : playable.size ? `${local ? name(who) + ': ' : ''}tap a highlighted card` : 'No match? Tap the deck to pick a card';
  $('#last-move').textContent = lastMessage;
  if (s.status === 'finished') finish();
}
function handoff() {
  handHidden = true;
  render();
  modal(`<div class="handoff-icon">⇄</div><h2 id="dialog-title">${name(game.state.currentPlayer)}’s turn</h2><p>Pass the device. Your cards stay hidden until you’re ready.</p><button class="wood-button" data-action="ready">Show my cards</button>`, true);
}
function afterMove(result, who) {
  if (!result?.ok) return;
  sound('play');
  if (result.card) {
    const c = result.card;
    let copy = `${name(who)} played ${c.rank === 'JOKER' ? 'a Joker' : c.rank + c.suit}.`;
    if (['8', 'J'].includes(c.rank) && !result.finished) copy += ' Play again.';
    if (['A', 'JOKER'].includes(c.rank)) copy += ` ${SUIT_NAMES[game.state.activeSuit]} next.`;
    if (game.state.penalty) copy += ` Pick up ${game.state.penalty}.`;
    announce(copy);
  } else if (result.cut) announce(`${name(who)} cut the game.`);
  else if (result.cards) announce(`${name(who)} picked ${result.cards.length} card${result.cards.length === 1 ? '' : 's'}.`);
  else announce(`${name(who)} ended the turn.`);
  const s = game.state;
  if (local && s.status === 'playing' && s.currentPlayer !== who) handHidden = true;
  render();
  if (s.status !== 'playing') return;
  if (local && s.currentPlayer !== who) handoff();
  else if (!local && s.currentPlayer === 'ai') scheduleAi();
}
function scheduleAi() {
  clearTimeout(aiTimer);
  const match = game;
  aiTimer = setTimeout(() => {
    if (!$('#overlay').hidden) return;
    if (game !== match || game.state.status !== 'playing' || game.state.currentPlayer !== 'ai' || local) return;
    afterMove(game.aiMove(), 'ai');
  }, 850);
}
function play(id) {
  const who = actor();
  if (!game || handHidden || game.state.currentPlayer !== who) return;
  const card = game.state.hands[who].find(c => c.id === id);
  if (!game.canPlay(card, who)) return;
  if (['A', 'JOKER'].includes(card.rank)) {
    pendingCard = id;
    modal(`<div class="ribbon">${card.rank === 'A' ? 'Ace played' : 'Joker played'}</div><h2 id="dialog-title">Choose a suit</h2><div class="suit-picker">${SUITS.map(s => `<button class="suit-choice ${red(s)}" data-action="suit" data-suit="${s}" aria-label="${SUIT_NAMES[s]}"><strong>${s}</strong><small>${SUIT_NAMES[s]}</small></button>`).join('')}</div>`);
    return;
  }
  afterMove(game.play(id, { player: who }), who);
}
function finish() {
  if (recorded) return;
  recorded = true;
  clearTimeout(aiTimer);
  const s = game.state, won = s.winner === 'player';
  if (!local) {
    profile.games++;
    if (won) { profile.wins++; profile.currentStreak++; profile.bestStreak = Math.max(profile.bestStreak, profile.currentStreak); }
    else profile.currentStreak = 0;
    save(); refreshProfile();
  }
  if (won || local) sound('win');
  const title = s.winner === 'tie' ? 'It’s a tie!' : local ? `${name(s.winner)} wins!` : won ? 'You win!' : 'Computer wins';
  const copy = s.cut ? `Cut scores: ${name('player')} ${s.cutTotals.player} · ${name('ai')} ${s.cutTotals.ai}. Lower points wins.` : s.blocked ? `No cards left to play. ${name('player')}: ${game.points('player')} points · ${name('ai')}: ${game.points('ai')} points.` : `${s.winner === 'tie' ? 'Both hands matched.' : name(s.winner) + ' played every card.'} Ready for another round?`;
  modal(`<div class="result-icon">${won || local ? '♛' : '♠'}</div><h2 id="dialog-title">${title}</h2><p>${copy}</p><div class="dialog-actions"><button class="wood-button" data-action="home">Home</button><button class="wood-button" data-action="again">Play again ▶</button></div>`, true);
}
function help() {
  const row = (glyph, title, copy) => `<div class="help-row"><span class="rule-card">${glyph}</span><p><b>${title}</b>${copy}</p></div>`;
  modal(`<div class="ribbon">Quick guide</div><h2 id="dialog-title">How to play</h2><p><b>Play all your cards first.</b><br>Tap a card with the same suit or number as the card on the table.</p><div class="help-rules">${row('A', 'Choose a suit', 'Play an Ace and choose the suit your opponent must follow.')}${row('2', 'Pick up two', 'Your opponent picks 2 cards, or plays another 2 to add to the penalty.')}${row('8 / J', 'Play again', 'An 8 or Jack skips your opponent’s turn.')}${row('7', 'Cut the game', 'Hold the 7 shown by “Cut with”. If your other cards total less than 25 points, you can cut. The lower score wins; a tie favors the opponent.')}${row('★', 'Joker mode only', 'A Joker chooses a suit and adds 5 pickup cards. Stack a 2 or Joker to pass the penalty.')}</div><p class="help-note">No matching card? <b>Tap the deck.</b> If the new card fits, play it or tap the table to pass. If it doesn’t fit, your turn ends automatically.</p><details class="points-guide"><summary>Card points for cutting</summary><p>A♠ = 60 · other Aces = 15 · 2 = 20 · 3 = 30 · J = 11 · Q = 12 · K = 13 · Joker = 50. Other cards use their number. The cut 7 is laid down before counting.</p></details><div class="dialog-actions"><button class="wood-button" data-action="close">Got it</button></div>`);
}
function settings() {
  modal(`<div class="ribbon">Make it yours</div><h2 id="dialog-title">Customize</h2><p>Choose your table.</p><div class="theme-picker">${[['wood','Wood'],['green','Green'],['night','Night']].map(([value,title]) => `<button class="theme-choice ${profile.theme === value ? 'selected' : ''}" data-action="theme" data-theme="${value}" aria-pressed="${profile.theme === value}"><span class="swatch swatch-${value}">♠ ♥</span>${title}</button>`).join('')}</div><div class="setting-row"><span>Game sounds</span><button class="toggle" data-action="sound">${profile.sound ? 'On' : 'Off'}</button></div><div class="dialog-actions"><button class="wood-button" data-action="close">Done</button></div>`);
}
function stats() {
  modal(`<div class="ribbon">On this device</div><h2 id="dialog-title">My scores</h2><p>Your record against the computer.</p><div class="score-grid">${[[profile.wins,'Wins'],[profile.games,'Games'],[profile.bestStreak,'Best streak'],[profile.games ? Math.round(profile.wins / profile.games * 100) + '%' : '0%','Win rate']].map(([value,label])=>`<div><strong>${value}</strong><small>${label}</small></div>`).join('')}</div><div class="dialog-actions"><button class="wood-button" data-action="close">Done</button></div>`);
}
function menu() {
  modal(`<h2 id="dialog-title">Pause for a moment</h2><div class="menu-options"><button class="wood-button" data-action="close">Keep playing</button><button class="wood-button" data-action="restart">New round</button><button class="wood-button" data-action="settings">Customize</button><button class="wood-button" data-action="home">Home</button></div>`);
}
function home() { clearTimeout(aiTimer); close(true); game = null; setScreen('home'); refreshProfile(); }
function sound(kind) {
  if (!profile.sound) return;
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    audioContext.resume();
    const oscillator = audioContext.createOscillator(), gain = audioContext.createGain(), now = audioContext.currentTime;
    oscillator.frequency.setValueAtTime(kind === 'win' ? 620 : 410, now);
    oscillator.frequency.exponentialRampToValueAtTime(kind === 'win' ? 880 : 330, now + .13);
    gain.gain.setValueAtTime(.035, now); gain.gain.exponentialRampToValueAtTime(.001, now + .18);
    oscillator.connect(gain); gain.connect(audioContext.destination); oscillator.start(); oscillator.stop(now + .2);
  } catch { /* Sound is optional. */ }
}
function click(event) {
  const target = event.target.closest('[data-action]');
  if (!target || target.disabled) return;
  const action = target.dataset.action;
  if (action === 'start') start(target.dataset.mode);
  else if (action === 'home') home();
  else if (action === 'again') start(local ? 'local' : game.mode);
  else if (action === 'restart') modal(`<h2 id="dialog-title">Start a new round?</h2><p>This unfinished round won’t count in your scores.</p><div class="dialog-actions"><button class="wood-button" data-action="close">Cancel</button><button class="wood-button" data-action="again">Deal again</button></div>`);
  else if (action === 'ready') { visiblePlayer = game.state.currentPlayer; handHidden = false; close(true); announce('Tap a highlighted card to play.'); render(); }
  else if (action === 'help') help();
  else if (action === 'settings') settings();
  else if (action === 'stats') stats();
  else if (action === 'menu') menu();
  else if (action === 'close') close();
  else if (action === 'play') play(target.dataset.card);
  else if (action === 'suit') { const id = pendingCard, who = actor(); close(); afterMove(game.play(id, { player: who, suit: target.dataset.suit }), who); }
  else if (action === 'draw' && game && !handHidden) afterMove(game.draw(actor()), actor());
  else if (action === 'pass' && game && !handHidden) afterMove(game.pass(actor()), actor());
  else if (action === 'cut' && game && !handHidden) afterMove(game.cut(actor()), actor());
  else if (action === 'theme') {
    profile.theme = target.dataset.theme; save(); refreshProfile();
    $$('.theme-choice').forEach(button => { const selected = button.dataset.theme === profile.theme; button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', String(selected)); });
  } else if (action === 'sound') {
    profile.sound = !profile.sound; save(); refreshProfile();
    const toggle = $('.toggle'); if (toggle) toggle.textContent = profile.sound ? 'On' : 'Off';
  }
}
document.addEventListener('click', click);
$('#overlay').addEventListener('click', event => { if (event.target === $('#overlay')) close(); });
document.addEventListener('keydown', event => {
  if ($('#overlay').hidden) return;
  if (event.key === 'Escape') close();
  if (event.key === 'Tab') {
    const nodes = [...$('#dialog').querySelectorAll('button,summary,[tabindex="0"]')];
    const first = nodes[0], last = nodes.at(-1);
    if (event.shiftKey && (document.activeElement === first || document.activeElement === $('#dialog'))) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || document.activeElement === $('#dialog'))) { event.preventDefault(); first?.focus(); }
  }
});
window.addEventListener('resize', () => { if (screen === 'game') render(); });
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
refreshProfile();
