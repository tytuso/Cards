# Cards — Matatu by Nile AI

A simple, wooden-table Matatu game inspired by the reference screens supplied by the user. Open Classic, Joker, or 2 players with one tap. The mobile hand overlaps to keep a normal seven-card deal on screen; larger hands scroll. Themes and scores stay on this device.

## Modes

- **Classic:** 52 cards, seven per player, against the computer.
- **Joker:** Classic plus two Jokers. A Joker changes the suit and adds five pickup cards.
- **2 players:** Classic on one device. A private handover screen hides the next hand until that player is ready.

## Rules

The supplied in-app help screenshot is the reference for Classic:

- Match the table card's suit or rank; empty your hand first to win.
- Ace chooses the next suit. 2 adds two pickup cards; another 2 stacks the penalty.
- 8 and Jack skip the other player. 3 is an ordinary matching card.
- Pick from the deck when there is no match. A non-matching draw ends the turn automatically. A matching draw can be played or forfeited by tapping the table or End turn.
- The deck's bottom suit sets the cut suit. Lay its 7 when the remaining hand totals **less than 25** points. Lowest points wins; a tied cut favors the opponent.
- In Joker mode, 2s and Jokers stack penalties together.
- No timed one-card call is required.

Cut values: A♠ 60, other Aces 15, 2 20, 3 30, J 11, Q 12, K 13, Joker 50; other cards use their numbers. These inherited scoring values and the Joker extension are shown explicitly in Help. The reference screenshot does not enumerate them.

## Offline

App files and vector assets are cached after the first online visit. No accounts or remote game data are needed. Two-player mode is same-device, not online multiplayer. Cache v3 replaces the previous design. The app supports portrait and landscape layouts.

## Checks

```sh
npm test
npm run check
```

No build step or dependencies are required. Serve the folder over HTTP when testing ES modules locally.
