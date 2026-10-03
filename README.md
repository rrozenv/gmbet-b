# GM Bet, concept B: Live terminal

Landing page concept: Robinhood's dark-mode calm with Polymarket's density. The hero is a wall of chess matches shown as markets, and the bet slip in front of it takes one tap or one swipe.

Live: https://rrozenv.github.io/gmbet-b/

## Layout

- `site/` is the whole static site, deployed as-is by `.github/workflows/pages.yml`.
  - `app.js` runs the wall, the payout feed, the bet slip, the rolling numbers, and the waitlist.
  - `board.js` draws boards on canvas from cached piece sprites, so dozens of boards stay at 60 fps.
  - `games.js` is generated. Edit the PGN in `scripts/games.mjs`, then run `npm run games`. chess.js checks every move.
- `scripts/assets.mjs` renders `og.png` and the dark icons from `scripts/og.html`.
- `scripts/verify.mjs` takes the screenshots and the interaction video, and checks layout shift, clipped text, contrast, and frame rate.

## Run

```sh
npm install
npm run serve        # http://127.0.0.1:8742/
npm run assets       # with the server running
npm run verify       # with the server running
```

## Waitlist

Same Supabase project and table as the main site. The browser calls only `join_waitlist` and `waitlist_place` with the publishable key. Signups from this page carry `concept-b` in `source`.

## Honesty rules

Everything on the wall, in the feed, and in the bet slip is a sample and is labeled Preview. No live stats are shown. Chess pieces by Colin M.L. Burnett, BSD license.
