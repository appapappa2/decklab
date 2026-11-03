# The Deck Lab: hand feel prototype

A browser lab for tuning how the cards in the player's hand feel before building it natively for iPhone. It uses plain HTML, CSS and JS: no dependencies and no build step.

## Run

ES modules need to be served over HTTP, not `file://`:

```sh
cd thedeck-lab
python3 serve.py        # optional port: python3 serve.py 8800
```

Use `serve.py` rather than `python3 -m http.server`. The stock server only queues 5 connections, so the browser's parallel module requests sometimes get reset and the app silently never boots. `serve.py` also disables caching so edits show up on a normal reload.

- **Desktop:** open <http://localhost:8000>. You get an emulated iPhone 15 frame (393×852) with the lab panel on the right.
- **iPhone:** make sure the phone and computer are on the same Wi‑Fi. Find your Mac's IP with `ipconfig getifaddr en0`, then open `http://<ip>:8000` in Safari. It runs fullscreen and follows real orientation changes. For a true fullscreen experience, use Share → *Add to Home Screen*.
- **Force a mode:** add `?mode=phone` or `?mode=desktop`.

The app opens on the **lobby**, a game select carousel: each game is a playing-card shaped cover built from its own cards, with the next and previous cards tilted away on either side and a big colored disc behind (as you move between games, the old disc fades away and the new game's disc grows from the center). The game's number and name, who you play against and a tagline sit under the card. Games that support multiplayer get a small **Single / Multi** toggle there too; each game remembers your choice, and a card is dimmed and marked *SOON* when the chosen mode isn't available yet (multiplayer, for now). **Swipe** or drag the cards, use the **mouse wheel**, **← →** or the dots, tap a side card to bring it forward, and tap the center card or press <kbd>Enter</kbd> to play: the camera zooms into the card while the game opens inside it through a growing circle, and the game only starts once the zoom has landed. Leaving a game plays the same zoom in reverse, back into its card. *Solitaire*, *War*, *Crazy Eights*, *Go Fish* (vs CPU), *Hearts* (vs 3 CPUs) and *Blackjack* (vs the dealer) are playable in singleplayer; multiplayer modes are all locked for now. The game catalog, with each game's colors, lives in `src/games.js`; the covers are drawn in `src/covers.js`. The small **dev** button in the corner opens the dev menu, which links to the hand feel prototype. Routes are hash-based, so you can link straight to a screen: `#/` (lobby), `#/dev` (dev menu), `#/dev/hand-feel` (prototype), `#/play/solitaire`, `#/play/war`, `#/play/crazy-eights`, `#/play/go-fish`, `#/play/hearts`, `#/play/blackjack`. In the prototype, the **‹** button goes back to the dev menu.

Desktop shortcuts (prototype only): <kbd>R</kbd> rotates the frame, <kbd>G</kbd> toggles the debug overlay, <kbd>Space</kbd> draws a card.

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
src/main.js     wiring, rAF loop, panel actions, shortcuts, route switching
src/lobby.js    lobby carousel + dev menu UI and hash routing
src/games.js    game catalog (lobby) and dev menu entries
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
src/hearts/rules.js     Hearts rules (passing, tricks, scoring, shooting the moon) + CPU strategy (no DOM)
src/hearts/scene.js     Hearts vs. 3 CPUs: RuleTable + Input, passing, tricks, scoreboard
src/blackjack/rules.js  Blackjack rules: bets, hit/stand/double/split, dealer play, payouts, event log (no DOM)
src/blackjack/scene.js  Blackjack table: chips, action buttons, animated deal from the shoe, results
serve.py        dev server (bigger connection backlog, no caching)
src/device.js   desktop frame (scale-to-fit, rotation, emulated safe areas) vs phone fullscreen (env() safe areas)
src/game.js     deck/hand/pile state → per-frame spring targets; play/draw/sort/return
src/input.js    pointer gesture state machine (press → scrub → drag / tap / long-press)
src/layout.js   pure layout math: metrics, fan/line/stack slots, nearest-slot picking
src/cards.js    deck data + CardSprite (DOM + springs, subtle depth tilt and pose-driven lighting/foil)
src/sparkles.js canvas sparkle trails for moving aces and court cards, plus landing bursts
src/ripples.js  soft gray water-like landing ripples beneath aces and court cards
src/spring.js   damped spring with fixed 1/240 s sub-steps (stable at 60/120 Hz)
src/velocity.js windowed pointer velocity (drives tilt + flick)
src/settings.js schema, defaults, presets, localStorage, auto-generated panel
src/debug.js    overlay: play line, hand zone, slots, pick points, finger, FPS
```

The game code only sees `(width, height, safeArea)`, so the emulated frame and a real phone run the same path. All card motion is spring-driven. Each frame sets targets from state, steps the springs, and updates transforms and lighting variables only when they change. Cards lean gently with movement, changing the paper lighting; aces and court cards have a centered foil finish and leave a brief sparkle trail. Cards emit a short outward sparkle burst when they land in the middle played pile; aces and court cards also send out a soft gray ripple that disperses into the table. Depth tilt, particles and ripples respect reduced motion. Nothing reads layout inside the loop.

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

## Go Fish

You against the CPU, 7 cards each, with the lab's hand again. **Playing a card asks for its rank**: drag it up toward the CPU, flick it, or tap it and press *Ask*. The card stays in your hand. If the CPU has any of that rank, it hands them all over and you go again; otherwise it says *Go fish!* and you draw from the pond, going again if you fish the rank you asked for. Four of a rank is a book and is laid down right away (your books sit above your hand, the CPU's under its hand; beside them in landscape). Cards you receive slot in next to the same rank. An empty hand draws a card from the pond; with the pond empty, that player sits out. When all 13 books are down, the most books wins. The CPU remembers which ranks you've asked for and goes after those first; otherwise it asks for the rank it holds most of. Speech bubbles narrate each step, and the game is saved after every ask.

## Hearts

You (bottom) against three CPUs: West, North and East, playing clockwise. 13 cards each, again in the lab's hand. **Passing:** before each hand, tap 3 cards and press *Pass*; the direction rotates left, right, across, then a hand with no pass. Cards you receive glow blue for a moment, and your hand is sorted by suit. **Playing:** drag a card up, flick it, or tap it and press *Play*. The 2♣ leads the first trick; follow suit if you can; no hearts or Q♠ on the first trick; hearts can't be led until one has been played. Cards you can't play are dimmed, and an illegal play snaps back with the reason ("Follow suit: play a club"). The highest card of the led suit takes the trick (aces high) and leads the next. Each heart is 1 point and the Q♠ is 13; taking all 26 shoots the moon (everyone else gets 26). After each hand a scoreboard shows the points; when someone reaches 100, the lowest score wins. The CPUs pass their dangerous cards (high spades, high hearts, cards that empty a short suit), duck under the winning card when they can, and dump the Q♠ and high hearts when they can't follow suit. The game is saved after every card.

## Blackjack

You against the dealer, starting with a bank of 1,000. Tap the **chips** (10/25/50/100) to build a bet, then **Deal** (or <kbd>Space</kbd>). Play with **Hit / Stand / Double / Split** (or <kbd>H</kbd> <kbd>S</kbd> <kbd>D</kbd> <kbd>P</kbd>). Blackjack pays 3:2 (rounded down to whole chips), other wins 1:1, and the dealer stands on all 17s and peeks for blackjack when showing an ace or a ten. Double on any first two cards, including after a split. Split pairs of the same value into up to 4 hands; split aces get one card each, and 21 on a split hand isn't a blackjack. No insurance. One deck, dealt from the shoe on the right, with used cards stacking in the tray on the left until it's reshuffled (when fewer than 15 cards are left). Totals show next to each hand ("soft 15"); after the dealer plays, each hand shows its result and the bank updates. If you run out of chips, *Reset bank* gives you 1,000 again. Your bank and bet are saved; leaving in the middle of a round gives the bet back.

## Known limitations

- **Haptics:** this uses `navigator.vibrate`, which iOS Safari does not support, so it only works on Android Chrome. The native app should use `UIImpactFeedbackGenerator` / `UISelectionFeedbackGenerator` at the same points: pick-up, scrub slot change, gap change and play.
- Hand cards are hit-tested by layout (x against slot positions), not by each card's rotated shape. This is intentional, because it keeps scrubbing smooth.
- On desktop, the rotation animation spins the frame and then re-lays out the content, so the content is not crossfaded the way iOS does it.
- Fullscreen in mobile Safari with the browser chrome visible still shows the toolbar. Use Add to Home Screen for true fullscreen.
