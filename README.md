# Cards — Matatu by Nile AI

Cards is a responsive, single-player version of Matatu. Play offline against Nile AI, learn the rules in-app, and keep your wins and streaks on your device.

## Play locally

This is a build-free web app. Serve this folder over HTTP so the browser can load the ES modules and install the service worker:

```sh
python3 -m http.server 4173
```

Open `http://localhost:4173` in a browser. It can also be hosted as a static site on GitHub Pages, Vercel, Netlify, or a custom domain.

## Game rules in this version

- Match the suit or rank on the table. An Ace is wild and lets you choose the next suit.
- **2** adds two pickup cards and **3** adds three. Stack a 2, 3, or Joker to pass the running penalty.
- **8** and **Jack** skip the opponent in this two-player game.
- A **Joker** adds five pickup cards and lets you choose the next suit. The **Ace of Spades** cancels a pickup penalty.
- The cut suit is marked on the table. If you hold its **7** and your hand is worth 25 points or less, cut the round; the lower hand score wins, with a tie going to the other player.
- Draw when you cannot play. Play the card if it fits, otherwise end your turn. Call **Matatu** with one card left; missing the four-second call adds two cards.

Matatu has regional and family variations. This build uses a common Ugandan two-player ruleset and shows its rules in the game.

## Offline and privacy

The service worker caches the app shell for offline play after the first visit. There is no account, backend, analytics, or network-loaded game asset. Game totals, streaks, sound preference, and difficulty are stored in local browser storage.

## Checks

```sh
npm test
npm run check
```

The game engine is kept separate from the UI so multiplayer, more house rules, and additional game modes can be added later without replacing the card logic.

