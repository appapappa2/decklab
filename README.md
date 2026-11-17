# The Deck Lab: hand feel prototype

A browser lab for tuning how the cards in the player's hand feel before building it natively for iPhone. It uses plain HTML, CSS and JS: no dependencies and no build step.

## Run

ES modules need to be served over HTTP, not `file://`:

```sh
cd thedeck-lab
python3 serve.py        # optional port: python3 serve.py 8800
```

Use `serve.py` rather than `python3 -m http.server`. The stock server only queues 5 connections, so the browser's parallel module requests sometimes get reset and the app silently never boots. `serve.py` also disables caching so edits show up on a normal reload.

- **Desktop:** open <http://localhost:8000>. You get the **devboard**: a bar of tabs on top, with the page under it.
  - **Game:** an emulated iPhone 15 frame (393×852) running the app, with the lab panel on the right in the hand feel prototype.
  - **Animations:** a second phone showing a Stress table that deals and then holds still (not playable), with the **effects board** beside it.
  - **Sounds:** an empty space for sound tests.

  **Full motion**, at the right of the bar, plays every animation even when *Reduce motion* is on in the system settings (`src/motion.js`; every reduced-motion check in the app goes through it). It is on by default on desktop; a real phone follows the system. The embedded Stress table follows the switch too.

  The devboard remembers the last tab; `?tab=game`, `?tab=animations` or `?tab=sounds` opens one directly. Keyboard shortcuts only reach the game while the Game tab is showing.
- **iPhone:** make sure the phone and computer are on the same Wi‑Fi. Find your Mac's IP with `ipconfig getifaddr en0`, then open `http://<ip>:8000` in Safari. It runs fullscreen and follows real orientation changes. For a true fullscreen experience, use Share → *Add to Home Screen*.
- **Force a mode:** add `?mode=phone` or `?mode=desktop`.

The app starts with a short **intro** (about 4.8 s; tap or press any key to skip): every game's card is dealt into a tilted grid, repeated across the screen, then the columns start scrolling, neighbors in opposite directions. At the end every card flies out from the center of the screen while the lobby zooms in from the center underneath them. It only plays when the app opens on the lobby.

The **lobby** is a game select carousel: each game is a playing-card shaped cover built from its own cards, with the next and previous cards tilted away on either side. Behind the carousel turns one big wheel of suits: rings of spade, heart, club and diamond around the card, in the active game's color, rotating slowly and a notch further for every game you scroll past. The cards on the cover that lands in the middle hop. The game's name sits above the card; who you play against and a tagline sit under it, and a big **Play** bar runs along the bottom. Games that support multiplayer get a **Single / Multi** switch inside the Play bar; each game remembers your choice, and a card is dimmed and marked *SOON* when the chosen mode isn't available yet (multiplayer, for now). **Swipe** or drag anywhere, use the **mouse wheel** or **← →** (a row of dots drops in under the game's name while the carousel moves, and leaves when a game lands), tap a side card to bring it forward, and tap **Play**, the center card or press <kbd>Enter</kbd> to play: twelve big cards are thrown up from below, hang at the top of their arc where they cover the screen while the table is swapped in behind them, and fall back down to reveal the game as it starts to deal. Leaving a game uses the same curtain to bring the lobby back. *Solitaire*, *War*, *Crazy Eights*, *Go Fish* (vs CPU), *Hearts* (vs 3 CPUs), *Blackjack* (vs the dealer) and *Speed* (real time vs a CPU) are playable in singleplayer. *Rummy 500*, *Shithead*, *Spades*, *Cribbage*, *Casino*, *Euchre*, *Texas Hold’em*, *Gin Rummy*, *President* and *Slapjack* are playable in both: vs CPUs, or multiplayer for 2–4 people on one device (`#/play/rummy-500/multi`, `#/play/shithead/multi`, `#/play/spades/multi`, `#/play/cribbage/multi`, `#/play/casino/multi`, `#/play/euchre/multi`, `#/play/poker/multi`, `#/play/gin/multi`, `#/play/president/multi`, `#/play/slapjack/multi`). Switching a game between Single and Multi keeps both games saved; the other mode's table is cleared until you deal. Other multiplayer modes are locked for now. The game catalog, with each game's colors, lives in `src/games.js`; the covers are drawn in `src/covers.js`. The round **settings** button top right opens a small sheet with the backdrop, haptics and a link to the dev menu, which leads to the hand feel prototype. Routes are hash-based, so you can link straight to a screen: `#/` (lobby), `#/dev` (dev menu), `#/dev/hand-feel` (prototype), `#/play/solitaire`, `#/play/war`, `#/play/crazy-eights`, `#/play/go-fish`, `#/play/hearts`, `#/play/blackjack`. In the prototype, the **‹** button goes back to the dev menu.

Your avatar sits top left in the lobby with your **rank** in a small badge on its corner. Tapping it opens your profile (`src/profile.js`): the avatar, your rank, the objective that leads to the next one with a progress bar ("Win every game once"), and a row to change the avatar (one of the four suits, or an uploaded picture; until you choose, it says "You"). It is a mockup: the rank and the progress are made-up numbers and nothing is counted yet; only the avatar choice is real and remembered on the device.

In the devboard's **Animations** tab, to the right of the phone, sits the **effects board** (`src/fxboard.js`): a button for every effect in `src/fx.js`, played on a frozen Stress table. That table is the app itself in an iframe (`index.html?embed=stress#/play/stress`): `main.js` deals it, skips the countdown, lets the middle piles turn over and then stops updating it, the CPU never moves, and the iframe takes no pointer input. The first group is what the games already trigger on their own (sparks, the big burst, shake, a score popping with its "+N", the your-turn glow, confetti, the card curtain, the countdown). The second is bigger moments that nothing triggers yet: win, lose, fireworks, a fountain of coins, a rain of suits, a flash, a climbing combo stamp, and a rank up. The board hides on a real phone and when the window is too narrow.

Inside a game every table uses the same **HUD** (`src/hud.js`): the opponents' round avatars sit top left with their line of detail, the **… menu** top right (`src/gamemenu.js`: New game, each game's options, Exit), and your "You" avatar bottom right just above your hand. Everything the game has to say (whose turn it is, scores, hints, your own counts) is a pill that slides out of your avatar to the left; the status pill takes the game's color when it is your move, and a ring marks whose turn it is. The pills come in three weights: the status line is filled, your own numbers are an outline, and hints are the quietest. Action buttons sit right-aligned under your avatar, and every draw pile's count caption is the same size whatever size the pile is drawn at. There is no title bar. The scenes still write plain text into their own labels; `hud.js` re-homes those elements and the CSS draws the circles, so a new game gets the HUD for free. Where the row sits is one custom property per game (`--hud-b`).

Desktop shortcuts (prototype only): <kbd>R</kbd> rotates the frame, <kbd>G</kbd> toggles the debug overlay, <kbd>Space</kbd> draws a card.

## Look

Everything is drawn in four colors, red `#F0442E`, yellow `#FFC42E`, green `#149A6A` and blue `#2B62F0`, on a neutral base (paper `#F5EFE3`, ink `#17140F`, card white `#FFFDF7`).

- **Backdrops:** the settings sheet in the lobby, the three swatches under the device frame next to Rotate, or <kbd>T</kbd> switch the base: **paper** (off-white, the default), **color** (the selected game's own color, edge to edge) and **ink** (near-black). The choice is saved and applies to the lobby and every game.
- **Games:** each game has a `color` and a partner `pop` in `src/games.js`. The cover is the color, its name sticker and card backs are the pop; in a game they drive the card backs, the primary button and the "your turn" dot.
- **Deck:** a four-color deck. Spades are blue, hearts red, clubs green and diamonds yellow; ranks are ink. Aces and court cards look like every other card.
- **Game feel:** `src/fx.js` watches the tables and answers the moments that matter: sparks when you take a trick or win a hand, a bigger burst and a shake for "WAR!" and "Go!", a short shake when it goes against you, scores that pop with a "+3" floating off them, a glow from your side when your turn starts, and corner cannons plus a rain of confetti when you win a game. Every card that lands leaves a ripple.
- **Type:** one typeface, Futura, at two weights (Medium for text, Bold for names and buttons), falling back to the system font where it isn't installed.
- **Feedback:** buttons sit on a hard edge and sink when pressed, banners and toasts pop in as stickers, dialogs drop in as white cards, and the selected card gets a ring that snaps on. Animations are cut short under `prefers-reduced-motion`.

The tokens live at the top of `style.css` (palette, then one block per backdrop); `src/theme.js` sets `data-theme` on `<html>` and the game's `data-c` / `data-p` on `#screen`. The lobby and game styles use only those tokens; the lab's side panel and device frame keep their own dark chrome.

## Gestures

| Gesture | Result |
| --- | --- |
| Press and slide across the hand | Scrub/peek: the card under your finger lifts, scales up and straightens, and its neighbors spread apart |
| Tap a card | Toggle selected; a **Play** button appears above it (same result as the play gesture) |
| Drag upward | Card detaches and follows your finger (offset above it) and tilts with horizontal velocity |
| Release above the play line or over the play zone | Plays the card |
| Fast upward flick | Plays the card even if it's below the line |
| Drag sideways while low (in the hand zone) | Reorder: the other cards open a gap live |
| Long-press a card | Pick it up without moving (useful for reordering) |
| Tap the deck / tap the pile | Draw a card / return played cards to the hand |
| Swipe the hand / mouse wheel | Scroll the hand when it overflows the screen (see *Screen overflow*) |

### Mouse

Everything works with a mouse (Pointer Events), plus some mouse-specific behavior:

- **Hover** over the hand to peek. No click is needed. Toggle with *Mouse → Hover to peek*.
- **Click** = tap (select). **Click and drag** = drag (play / reorder). **Press and slide** scrubs, same as touch.
- A dragged card stays **where you grabbed it**, since a cursor doesn't cover the card the way a finger does. Turn off *Mouse → Hold card where grabbed* to use the touch finger offset instead.
- The cursor shows what's possible: `grab` over the hand, `grabbing` while holding a card, `pointer` over the deck and pile.
- Pens are treated like the mouse (hover works on pens that support it).

## Architecture

```
index.html      markup: device frame, screen, table, panel
style.css       frame, felt, cards (DOM/CSS only), panel, phone fullscreen
src/motion.js   reduced motion: the system setting, unless the devboard's Full motion is on
src/devboard.js desktop shell: Game / Animations / Sounds tabs; the Animations phone and its effects board
src/main.js     wiring, rAF loop, panel actions, shortcuts, route switching
src/lobby.js    lobby carousel + dev menu UI and hash routing
src/games.js    game catalog (lobby) and dev menu entries
src/intro.js    opening intro: tilted grid of game cards, columns scrolling in opposite directions
src/covers.js   lobby cover art per game, made from real card faces (container query units, any size)
src/solitaire/rules.js  Klondike rules: deal, legal moves, draw/recycle, undo, auto-finish, save format (no DOM)
src/solitaire/scene.js  Solitaire screen: layout, spring-driven CardSprites, drag & drop, tap to move, HUD
src/war/rules.js        War rules: deal, battles, wars, collecting, save format (no DOM)
src/war/scene.js        War screen vs. CPU: layout, flips, banners, auto-play
src/table.js    RuleTable: the lab's Game (the tuned hand) with hooks so a game decides what playing a card means
src/eights/rules.js     Crazy Eights rules + CPU strategy, save format (no DOM)
src/eights/scene.js     Crazy Eights vs. CPU: RuleTable + Input, CPU hand, suit picker
src/gofish/rules.js     Go Fish rules + CPU strategy (remembers your asks), event log, save format (no DOM)
src/gofish/scene.js     Go Fish vs. CPU: RuleTable + Input, asks, books, speech bubbles, event playback
src/palace/rules.js     Palace (Shithead) rules: swap phase, playing up, 2 resets, 10 and four-of-a-kind burns, table cards, CPU strategy (no DOM)
src/palace/scene.js     Palace table: RuleTable + Input, your three table stacks, pile, burns, pass-and-play handoff
src/speed/rules.js      Speed rules: center piles one up/one down, refills, stuck flips and reshuffles, CPU move (no DOM)
src/speed/scene.js      Speed table in real time: tap/drag to play, CPU clock per level, countdown, pause, best times (also the base of the Stress table)
src/stress/rules.js     Stress rules: four face-up cards each, draw piles flipping onto the middle, one up/one down, calling Stress on matching piles (no DOM)
src/stress/scene.js     Stress table: extends the Speed table; face-up CPU cards, the Stress! button, taken piles flying to the loser
src/casino/rules.js     Casino rules: captures by rank and sums, builds (raising, ownership), sweeps, round scoring, CPU (no DOM)
src/casino/scene.js     Casino table: pick table cards, Capture/Build/Trail, build badges, capture piles, round scoreboard
src/gin/rules.js        Gin Rummy rules: optimal meld finder, upcard offer, knock/gin/undercut, layoffs, box and game bonuses, CPU (no DOM)
src/gin/scene.js        Gin Rummy table: self-arranging hand with meld markers and deadwood count, stock and discard, knock/gin
src/slapjack/rules.js   Slapjack rules: flipping, slapping jacks, burning on a wrong slap, last chance to slap back in (no DOM)
src/slapjack/scene.js   Slapjack table: piles around the screen, CPU reaction times, two-player split screen, slap hand
src/blackjack/rules.js  Blackjack rules: bets, hit/stand/double/split, dealer play, payouts, event log (no DOM)
src/blackjack/scene.js  Blackjack table: chips, action buttons, animated deal from the shoe, results
src/transition.js the card transition between the lobby and a game
src/fx.js       game feel for every table: confetti, bursts, shakes, score pops and floaters
src/theme.js    backdrop themes (paper / color / ink) and the current game's color pair
serve.py        dev server (bigger connection backlog, no caching)
src/device.js   desktop frame (scale-to-fit, rotation, emulated safe areas) vs phone fullscreen (env() safe areas)
src/game.js     deck/hand/pile state → per-frame spring targets; play/draw/sort/return
src/input.js    pointer gesture state machine (press → scrub → drag / tap / long-press)
src/layout.js   pure layout math: metrics, fan/line/stack slots, nearest-slot picking
src/cards.js    deck data + CardSprite (DOM + springs, subtle depth tilt and pose-driven lighting)
src/sparkles.js canvas sparkle trails for moving aces and court cards, plus landing bursts
src/ripples.js  soft gray water-like landing ripples beneath aces and court cards
src/spring.js   damped spring with fixed 1/240 s sub-steps (stable at 60/120 Hz)
src/velocity.js windowed pointer velocity (drives tilt + flick)
src/settings.js schema, defaults, presets, localStorage, auto-generated panel
src/debug.js    overlay: play line, hand zone, slots, pick points, finger, FPS
```

The game code only sees `(width, height, safeArea)`, so the emulated frame and a real phone run the same path. All card motion is spring-driven. Each frame sets targets from state, steps the springs, and updates transforms and lighting variables only when they change. Cards lean gently with movement, changing the paper lighting; aces and court cards look like any other card, but still leave a brief sparkle trail. Cards emit a short outward sparkle burst when they land in the middle played pile; aces and court cards also send out a soft gray ripple that disperses into the table. Depth tilt, particles and ripples respect reduced motion. Nothing reads layout inside the loop.

## Lab settings

All settings persist to `localStorage`. Double-click a label to reset that setting, or use **Reset to defaults**. Presets: *Balatro-ish*, *Hearthstone-ish*, *Flat & snappy*, *Tight stack*, *Scrolling hand*.

**Import / export:** the panel has a textbox. **Export** (or **Copy**) dumps the current settings as JSON; paste JSON and press **Import** to apply it. Partial JSON is fine, for example `{"overflow": "scroll", "minSpacing": 0.5}`. Unknown keys and invalid values are skipped and reported, and numbers are clamped to the slider range. `window.lab` exposes `{ game, input, settings, device, sparkles, ripples }` in the devtools console for poking around.

Units: **cw** = card widths, **ch** = card heights.

- **Layout:** mode (fan / line / stack), card size, max spacing (compresses automatically to fit), hand width, how much of the hand is hidden below the edge, fan radius (smaller means more curve), fan tilt, stack idle spacing (stack spreads out while touched).
- **Peek / scrub:** on/off, lift (above the fully visible position), scale, straighten, neighbor spread and falloff (multiplier per card), pick bias (0% = nearest card center, 100% = the visible strip of overlapped cards), hysteresis (resists flicker between two cards).
- **Select:** lift, multi-select, Play button on selected cards.
- **Screen overflow:** what happens when the hand is wider than the screen.
  - *Compress* squeezes the cards until they fit (the old behavior and the default).
  - *Overflow + scroll* stops compressing at **min spacing**, lets the hand run off-screen, and makes it scrollable.
  - **Scroll gesture:** *Swipe* (the hand follows your finger 1:1, with momentum and rubber-banding; drag up still pulls a card), *Edge* (scrub toward a screen edge to auto-scroll; tune with edge zone and speed), or *Proportional* (finger position across the screen maps to the whole hand). The mouse wheel or trackpad always scrolls.
  - **Fan arc anchored to:** *Screen* (cards roll along a fixed arc like a wheel) or *Hand* (the whole fan slides).
  - **Hidden cards hint:** none, an edge fade, a "‹ 3" count badge, or both.
  - Reordering a card near a screen edge also auto-scrolls.
- **Drag:** pull-out threshold (px of deliberate upward motion), long-press time (0 = off), finger offset, drag scale, velocity tilt (degrees per 1000 px/s; negative flips the direction), max tilt, reorder on/off.
- **Play:** play line (fraction of screen height), flick-to-play, flick velocity.
- **Motion:** hand spring stiffness and damping ratio, a separate stiffer spring for the dragged card, deal stagger.
- **Mouse:** hover to peek, hold the card where grabbed.
- **Feedback:** haptics, debug overlay.

## Solitaire

Klondike. **Drag** a card or a face-up run onto a column or foundation, or **tap** a card to send it to the best legal spot (foundation first). Tap the stock to draw; tap the empty stock to turn the waste over. **Undo** (also <kbd>Cmd</kbd>/<kbd>Ctrl</kbd>+<kbd>Z</kbd>) has no limit within a session. *Draw 1 / Draw 3* toggles the stock rule; it starts a new game if you've already made a move. When everything is face up and dealt out, **Auto-finish** appears. The game in progress is saved to `localStorage` and resumes after a reload; undo history isn't saved.

## War

You (bottom, blue backs) against the CPU (top, red backs; left/right in landscape). **Tap** anywhere or press <kbd>Space</kbd> to flip; the CPU flips a beat later. The higher card takes both (aces high). Tapping while a decided round is still showing collects it right away and flips the next one. A **tie means war**: each side puts 3 cards face down and 1 face up, and the new face-up cards decide (wars can chain). A player short on cards plays what they have, with the last one face up; running out entirely loses. Won cards go to the bottom of the winner's deck in random order so games always end. Games run a couple of hundred rounds, so **Auto-play** flips by itself until you tap or press *Stop*. The game is saved between rounds.

## Crazy Eights

You against the CPU, 7 cards each. **Your hand is the lab's hand**: same gestures (scrub to peek, drag up or flick to play, tap + *Play*, reorder, scroll) and the same tuning, since it reads the settings saved in the Hand feel prototype. Play a card matching the top card's suit or rank; **eights are wild**, and you then pick the next suit. Cards you can't play are dimmed, and an illegal play snaps back with a hint. If you can't play, the deck glows: tap it to draw, one card at a time, until you can. When the deck runs out, the pile (except the top card) is shuffled back in; if there's still nothing to draw, you pass, and if both players pass in a row the smaller hand wins. The CPU plays into the suit it holds most of, saves its eights for when it's stuck, and names its strongest suit. Who starts alternates between games. The game is saved after every move.

## Go Fish!

You against the CPU, 7 cards each, with the lab's hand again. **Playing a card asks for its rank**: drag it up toward the CPU, flick it, or tap it and press *Ask*. The card stays in your hand. If the CPU has any of that rank, it hands them all over and you go again; otherwise it says *Go fish!* and you draw from the pond, going again if you fish the rank you asked for. Four of a rank is a book and is laid down right away (your books sit above your hand, the CPU's under its hand; beside them in landscape). Cards you receive slot in next to the same rank. An empty hand draws a card from the pond; with the pond empty, that player sits out. When all 13 books are down, the most books wins. The CPU remembers which ranks you've asked for and goes after those first; otherwise it asks for the rank it holds most of. Speech bubbles narrate each step, and the game is saved after every ask.

## Blackjack

You against the dealer, starting with a bank of 1,000. Tap the **chips** (10/25/50/100) to build a bet, then **Deal** (or <kbd>Space</kbd>). Play with **Hit / Stand / Double / Split** (or <kbd>H</kbd> <kbd>S</kbd> <kbd>D</kbd> <kbd>P</kbd>). Blackjack pays 3:2 (rounded down to whole chips), other wins 1:1, and the dealer stands on all 17s and peeks for blackjack when showing an ace or a ten. Double on any first two cards, including after a split. Split pairs of the same value into up to 4 hands; split aces get one card each, and 21 on a split hand isn't a blackjack. No insurance. One deck, dealt from the shoe on the right, with used cards stacking in the tray on the left until it's reshuffled (when fewer than 15 cards are left). Totals show next to each hand ("soft 15"); after the dealer plays, each hand shows its result and the bank updates. If you run out of chips, *Reset bank* gives you 1,000 again. Your bank and bet are saved; leaving in the middle of a round gives the bet back.

## Palace

Also known as Shithead. 2–4 players: singleplayer against 1–3 CPUs, or pass-and-play. Everyone gets 3 face-down table cards, 3 face-up cards on top of them (your three stacks sit above your hand) and 3 cards in hand. **Swap first:** tap a hand card, then one of your face-up cards to swap them, and press *Ready* (in pass-and-play, each player swaps behind the *pass the device* screen). The player with the lowest ordinary card starts. **Play** one or more cards of the same rank, equal to or higher than the top of the pile (aces high): select them and press *Play*, or drag a card up. You draw back up to 3 while the deck lasts. **2** resets the pile (anything can follow), **10** burns it, and so does **four of a kind** in a row; after a burn you play again. Cards that won't go are dimmed; if nothing fits, *Pick up* the pile. With your hand and the deck empty, tap your face-up cards to play them (all of a rank at once), then your face-down cards blind: a card that doesn't fit is picked up with the pile. Players drop out as they run out of cards, and the last one holding cards is the **Shithead**. The CPUs put their 2s, 10s and high cards face up, play their lowest cards first, and save 2s and 10s (a 10 comes out when the pile gets big). Games are saved after every move.

## Stress

You against the CPU in real time; the setup card is just the question, three stacked buttons (Easy / Medium / Hard: how fast the CPU plays and calls), and picking one starts the game. The deck is split in two: each player lays **four cards face up** and keeps the rest as a face-down draw pile. To start, and whenever nobody can play, both flip the top of their pile onto their own middle pile. There are no turns: **tap** one of your four cards to play it onto a middle pile that is one rank up or down (K-A-2 connect), or **drag** it to the pile you want; you refill to four from your pile. When the two middle piles show the **same rank**, a **Stress!** button pops up (or press <kbd>Space</kbd>): whoever hits it first makes the other player take both piles. First to get rid of every card wins. There is no clock: the table keeps **money** next to each avatar instead, $1 for every card you get onto the middle and $1 per card the other player has to take when you win a call. The middle piles are the size of the cards in your hand, with a one-line reminder under them; your draw pile sits low at the corner of your hand with its count above it, and the CPU's count sits below its pile. Stacking equal ranks on your own four cards is left out.

## Speed

A real-time race against the CPU, with no turns. Each player has a 15-card draw pile and a 5-card hand; two side piles of 5 sit beside two center piles. After a 3-2-1 countdown, play any card that is **one rank up or down** from a center pile's top card (K-A-2 wrap around). **Tap a card** to play it wherever it fits, or **drag it onto the pile you want**; cards that fit nowhere are dimmed, and tapping one gives a little shake. Your hand refills from your draw pile automatically. When neither player can play, the side piles each flip a card onto the centers after a short pause; when the side piles run out, the center piles are shuffled into new ones. First to empty hand and draw pile wins. Choose the CPU's speed (Easy, Normal or Hard) before the race; it plays on its own clock and pauses briefly to "react" after you play. Your best winning time per level is saved. Leaving mid-race pauses it, and coming back counts down again before play resumes. Singleplayer only: a real-time race doesn't work as pass-and-play.

## Casino

Two players: you against the CPU, or pass-and-play. The dealer gives 4 cards each and 4 to the table, then 4 more each when hands run out, until the deck is gone. On your turn, **tap a card in your hand** (the table cards it could take glow green), **tap the table cards** you want (they turn yellow), then press:
- **Capture**: take cards of the same rank and groups that add up to your card's value (A = 1; J, Q, K only take their own rank), plus builds of that value. With nothing picked, it takes the most it can. Clearing the table is a **sweep**.
- **Build *N***: combine your card with the picked cards (and/or one build) into a total of 10 or less that you hold another card for. A badge shows the build's value and owner. The other player can capture it or raise it.
- **Trail**: lay the card on the table. Not allowed while you own a build, and you can't use up the card you're saving for it.

Dragging a card up plays it the quick way: capture what you picked (or the most it can), otherwise trail. When the deck is done, the last player to capture takes what's left. Each round scores most cards 3, most spades 1, big casino (10♦) 2, little casino (2♠) 1, aces 1 each and sweeps 1 each, shown in a scoreboard; first to 21 wins. The CPU weighs captures by what they're worth (the casinos, aces, spades, sweeps), builds when it can steal or bank cards, and trails cheap cards that don't set you up. The game is saved after every move.

## Gin Rummy

Two players: you against the CPU, or pass-and-play. 10 cards each; the first upcard is offered to the non-dealer, then the dealer (tap it to take it, or *Pass*). Each turn, **draw** by tapping the stock (it glows when it's your move) or the top of the discard pile, then **discard** by dragging a card up or selecting it and pressing *Discard*; you can't throw back the card you just took. Your hand **arranges itself** into the best melds (sets of 3–4, runs of 3+ in a suit, ace low) with a green band on meld cards and deadwood after them, and a label shows your deadwood, or with a card selected, what you'd have after discarding it. When that's 10 or less, **Knock** discards the selected card and ends the hand (the button says **Gin!** at zero). The defender lays off deadwood onto the knocker's melds (not after gin), then the summary explains the hand: the knocker scores the difference in deadwood; gin scores 25 plus the opponent's deadwood; if the defender's deadwood is as low or lower it's an **undercut** worth the difference plus 25. A hand with only two cards left in the stock is a draw. First to 100 wins, adding 100 plus 25 for every hand won, doubled for a shutout. The CPU finds its best melds after every draw, takes the discard only when it clearly helps, throws its highest useless card, and knocks early with low deadwood (holding out a little longer late in the deck).

## Slapjack

A reflex game: singleplayer against 1–3 CPUs (*Easy*, *Normal* or *Hard* reactions, about 0.95, 0.6 and 0.4 s), or two people on one device facing each other (each taps their own half of the screen; the top player's labels are upside down for them). The deck is dealt out; in turn, players flip their top card onto the center pile: **tap your own pile** (or <kbd>Enter</kbd>). When a **jack** shows (it glows), the first to **slap** takes the whole pile: tap anywhere else (or <kbd>Space</kbd>; with two players <kbd>D</kbd> and <kbd>K</kbd> slap, <kbd>F</kbd> and <kbd>J</kbd> flip). A hand lands on the pile from the slapper's side. Slapping anything but a jack **burns** one of your cards under the pile (the screen flashes red). A player who runs out gets one last chance: slap the next jack to get back in, or you're out. The last player in wins. The CPUs flip on their own, race for every jack, and on Easy sometimes slap a queen or king by mistake. The game is saved when you leave.

## Known limitations

- Multiplayer is pass-and-play on one device. There's no online play: the app is a static site without a server.

- **Haptics:** this uses `navigator.vibrate`, which iOS Safari does not support, so it only works on Android Chrome. The native app should use `UIImpactFeedbackGenerator` / `UISelectionFeedbackGenerator` at the same points: pick-up, scrub slot change, gap change and play.
- Hand cards are hit-tested by layout (x against slot positions), not by each card's rotated shape. This is intentional, because it keeps scrubbing smooth.
- On desktop, the rotation animation spins the frame and then re-lays out the content, so the content is not crossfaded the way iOS does it.
- Fullscreen in mobile Safari with the browser chrome visible still shows the toolbar. Use Add to Home Screen for true fullscreen.
