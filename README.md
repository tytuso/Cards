# Cards — Matatu by Nile AI

Cards is a responsive, single-player version of Matatu. Play offline against Nile AI, learn the rules in-app, and keep your wins and streaks on your device.

## Play locally

This is a build-free web app. Serve this folder over HTTP so the browser can load the ES modules and install the service worker:

```sh
python3 -m http.server 4173
```

Open `http://localhost:4173` in a browser. It can also be hosted as a static site on GitHub Pages, Vercel, Netlify, or a custom domain.

## Game rules in this version

- Match the suit or rank of the card on the table.
- **2** adds a two-card pickup penalty; **3** adds three. Either can be stacked on an active pickup penalty.
- **8** skips the other player. In a two-player game, you keep the turn.
- **Jack** is wild; choose the suit to continue.
- Draw one card when you have no playable card. If the drawn card does not fit, end your turn.
- Call **Matatu** when one card remains. You have four seconds; missing the call adds two cards.

Matatu has regional and family variations. This app uses one common Ugandan-style ruleset and spells it out in the game.

## Offline and privacy

The service worker caches the app shell for offline play after the first visit. There is no account, backend, analytics, or network-loaded game asset. Game totals, streaks, sound preference, and difficulty are stored in local browser storage.

## Checks

```sh
npm test
npm run check
```

The game engine is kept separate from the UI so multiplayer, more house rules, and additional game modes can be added later without replacing the card logic.
