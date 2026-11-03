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

The app starts with a short **intro** (about 4.8 s; tap or press any key to skip): every game's card is dealt into a tilted grid, repeated across the screen, then the columns start scrolling, neighbors in opposite directions. At the end every card flies out from the center of the screen while the lobby zooms in from the center underneath them. It only plays when the app opens on the lobby.

The **lobby** is a game select carousel: each game is a playing-card shaped cover built from its own cards, with the next and previous cards tilted away on either side and a big colored disc behind (as you move between games, the old disc fades away and the new game's disc grows from the center). The game's number and name, who you play against and a tagline sit under the card. Games that support multiplayer get a small **Single / Multi** toggle there too; each game remembers your choice, and a card is dimmed and marked *SOON* when the chosen mode isn't available yet (multiplayer, for now). **Swipe** or drag the cards, use the **mouse wheel**, **← →** or the dots, tap a side card to bring it forward, and tap the center card or press <kbd>Enter</kbd> to play: the camera zooms into the card while the game opens inside it through a growing circle, and the game only starts once the zoom has landed. Leaving a game plays the same zoom in reverse, back into its card. *Solitaire*, *War*, *Crazy Eights*, *Go Fish* (vs CPU), *Hearts* (vs 3 CPUs), *Blackjack* (vs the dealer) and *Speed* (real time vs a CPU) are playable in singleplayer. *Rummy 500*, *Shithead*, *Spades*, *Beggar-my-neighbour*, *Cribbage*, *Casino* and *Euchre* are playable in both: vs CPUs, or multiplayer for 2–4 people on one device (`#/play/rummy-500/multi`, `#/play/shithead/multi`, `#/play/spades/multi`, `#/play/beggar/multi`, `#/play/cribbage/multi`, `#/play/casino/multi`, `#/play/euchre/multi`). Other multiplayer modes are locked for now. The game catalog, with each game's colors, lives in `src/games.js`; the covers are drawn in `src/covers.js`. The small **dev** button in the corner opens the dev menu, which links to the hand feel prototype. Routes are hash-based, so you can link straight to a screen: `#/` (lobby), `#/dev` (dev menu), `#/dev/hand-feel` (prototype), `#/play/solitaire`, `#/play/war`, `#/play/crazy-eights`, `#/play/go-fish`, `#/play/hearts`, `#/play/blackjack`. In the prototype, the **‹** button goes back to the dev menu.

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
src/hearts/rules.js     Hearts rules (passing, tricks, scoring, shooting the moon) + CPU strategy (no DOM)
src/hearts/scene.js     Hearts vs. 3 CPUs: RuleTable + Input, passing, tricks, scoreboard
src/rummy/rules.js      Rummy 500 rules: draw/take from the spread discard pile, melds, lay-offs, scoring, CPU strategy (no DOM)
src/rummy/scene.js      Rummy 500 table: RuleTable + Input, discard spread, melds, seats, pass-and-play handoff
src/shithead/rules.js   Shithead rules: swap phase, playing up, 2 resets, 10 and four-of-a-kind burns, table cards, CPU strategy (no DOM)
src/shithead/scene.js   Shithead table: RuleTable + Input, your three table stacks, pile, burns, pass-and-play handoff
src/spades/rules.js     Spades rules: bidding (incl. Nil), trumps, partnership scoring with bags, CPU bidding and play (no DOM)
src/spades/scene.js     Spades table: RuleTable + Input, bid pad, trick, seats drawn relative to the player holding the device
src/speed/rules.js      Speed (Stress) rules: center piles one up/one down, refills, stuck flips and reshuffles, CPU move (no DOM)
src/speed/scene.js      Speed table in real time: tap/drag to play, CPU clock per level, countdown, pause, best times
src/beggar/rules.js     Beggar-my-neighbour rules: flips, court-card penalties, collecting the pile (no DOM)
src/beggar/scene.js     Beggar-my-neighbour table: piles around the screen, tap to flip, auto-play
src/cribbage/rules.js   Cribbage rules: crib, starter, pegging (15/31/pairs/runs/go), the show, CPU discard and pegging (no DOM)
src/cribbage/scene.js   Cribbage table: peg board, crib picking, pegging row with count, step-by-step show
src/casino/rules.js     Casino rules: captures by rank and sums, builds (raising, ownership), sweeps, round scoring, CPU (no DOM)
src/casino/scene.js     Casino table: pick table cards, Capture/Build/Trail, build badges, capture piles, round scoreboard
src/euchre/rules.js     Euchre rules: 24-card deck, bowers, order up / name trump, stick the dealer, going alone, scoring, CPU (no DOM)
src/euchre/scene.js     Euchre table (built from the Spades table): kitty and upcard, bidding panel, dealer discard, trump badge
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

## Rummy 500

2–4 players: **singleplayer** against 1–3 CPUs, or **pass-and-play multiplayer** where everyone shares the device. Choose the number of players before the deal. 13 cards each with 2 players, 7 with 3–4. On your turn, **draw**: tap the stock, or tap any card in the face-up discard spread to take it *and every card above it*. A card taken from below the top glows and must be melded this turn, so you can only take it when that's possible (discards you can't take are dimmed). Then **meld**: tap cards to select them and press *Meld* for a set (3–4 of a rank) or a run (3+ in a suit; ace low A-2-3 or high Q-K-A) or *Lay off* to add them to any meld on the table. **Discard** one card to end the turn: drag it up, or select it and press *Discard*. You can't throw back the top card you just took. The hand ends when someone empties their hand or the stock runs out: everyone scores the cards they put on the table minus the cards left in hand (aces 15, or 5 low in a run; 10s and faces 10; 2–9 count 5). First to 500 wins. In multiplayer an opaque *pass the device* screen hides the hand between turns, and a resumed game always starts on that screen. The CPUs dig into the discard pile when they can meld what they take, meld everything they can, and throw away high cards that don't connect. Singleplayer and multiplayer games are saved separately.

## Shithead

2–4 players: singleplayer against 1–3 CPUs, or pass-and-play. Everyone gets 3 face-down table cards, 3 face-up cards on top of them (your three stacks sit above your hand) and 3 cards in hand. **Swap first:** tap a hand card, then one of your face-up cards to swap them, and press *Ready* (in pass-and-play, each player swaps behind the *pass the device* screen). The player with the lowest ordinary card starts. **Play** one or more cards of the same rank, equal to or higher than the top of the pile (aces high): select them and press *Play*, or drag a card up. You draw back up to 3 while the deck lasts. **2** resets the pile (anything can follow), **10** burns it, and so does **four of a kind** in a row; after a burn you play again. Cards that won't go are dimmed; if nothing fits, *Pick up* the pile. With your hand and the deck empty, tap your face-up cards to play them (all of a rank at once), then your face-down cards blind: a card that doesn't fit is picked up with the pile. Players drop out as they run out of cards, and the last one holding cards is the **Shithead**. The CPUs put their 2s, 10s and high cards face up, play their lowest cards first, and save 2s and 10s (a 10 comes out when the pile gets big). Games are saved after every move.

## Spades

Four players in two partnerships: you (South) and your partner (North) against West and East. In singleplayer the other three are CPUs; in pass-and-play, 2–4 people take seats 1–4 (players 1 & 3 are partners, 2 & 4 are partners) and the empty seats are CPUs. Whoever holds the device is always drawn at the bottom. **Bid** on the number pad how many tricks you'll take, or **Nil**; the pad shows what your partner and the opponents bid. **Play** like Hearts: drag a card up, flick it, or tap it and press *Play*. Follow suit if you can; **spades are trump** and can't be led until one has been played. Cards you can't play are dimmed, and illegal plays snap back with the reason. Labels show each player's tricks/bid; the status line shows your team's progress. Scoring: a team that makes its combined bid scores 10 per trick bid plus 1 per extra trick (a bag); missing it costs 10 per trick bid. Nil is +100 if that player takes no tricks, −100 otherwise. Every 10 bags costs 100. First team to 500 wins (a team at −200 loses). The CPUs bid from aces, protected kings and spade length (bidding Nil with weak hands), win tricks only while the team still needs them, duck when they bid Nil, and cover a partner's Nil.

## Speed (Stress)

A real-time race against the CPU, with no turns. Each player has a 15-card draw pile and a 5-card hand; two side piles of 5 sit beside two center piles. After a 3-2-1 countdown, play any card that is **one rank up or down** from a center pile's top card (K-A-2 wrap around). **Tap a card** to play it wherever it fits, or **drag it onto the pile you want**; cards that fit nowhere are dimmed, and tapping one gives a little shake. Your hand refills from your draw pile automatically. When neither player can play, the side piles each flip a card onto the centers after a short pause; when the side piles run out, the center piles are shuffled into new ones. First to empty hand and draw pile wins. Choose the CPU's speed (Easy, Normal or Hard) before the race; it plays on its own clock and pauses briefly to "react" after you play. Your best winning time per level is saved. Leaving mid-race pauses it, and coming back counts down again before play resumes. Singleplayer only: a real-time race doesn't work as pass-and-play.

## Beggar-my-neighbour

2–4 players: singleplayer against 1–3 CPUs, or multiplayer around one device. The deck is dealt out; players take turns flipping their top card onto the center pile (tap anywhere or press <kbd>Space</kbd> on your turn; the CPUs flip on their own). An **ace, king, queen or jack** makes the next player pay **4, 3, 2 or 1** cards. Turning up a court card while paying passes a new debt to the next player; paying in full without one gives the whole pile to whoever played the last court card, and they lead next. A player who runs out of cards is out; the last one holding cards wins. Labels show each player's card count and what they owe, and a banner announces each debt and who takes the pile. It's pure luck, and games can run to hundreds of flips, so **Auto-play** flips for everyone until you tap or press *Stop*. In multiplayer nothing is hidden, so there's no pass-the-device screen: whoever is on turn just taps (the label and hint across the table are drawn upside down for that player). Games are saved after every pile.

## Cribbage

Two players: you against the CPU, or pass-and-play. A wooden **peg board** along the top shows both scores with a front and back peg (the back peg marks the score before the last points). Each hand, 6 cards are dealt; **tap two cards** and press *To crib* to give them to the dealer's crib (the hint reminds you whose crib it is). A **starter** is cut; a jack gives the dealer 2 ("his heels"). **Pegging**: the non-dealer leads and you take turns playing (drag a card up, or tap it and press *Play*) with the running count shown above the row; cards that would pass 31 are dimmed. Fifteen or 31 scores 2, pairs 2/6/12, runs 1 per card, and the last card before nobody can play scores 1 (a toast says who called “Go”). Then **the show**: press *Count* and *Next* to score the non-dealer's hand, the dealer's hand and the crib, each laid out with the starter and a breakdown ("Fifteen ×2: 4 · Run of 4: 4"). The first to 121 wins at once, even mid-hand; skunks are called out. The CPU picks its discards by averaging every possible starter and minds whose crib it is; when pegging it takes points and avoids leaving 5 or 21. The dealer alternates each hand, and the game is saved after every move.

## Casino

Two players: you against the CPU, or pass-and-play. The dealer gives 4 cards each and 4 to the table, then 4 more each when hands run out, until the deck is gone. On your turn, **tap a card in your hand** (the table cards it could take glow green), **tap the table cards** you want (they turn yellow), then press:
- **Capture**: take cards of the same rank and groups that add up to your card's value (A = 1; J, Q, K only take their own rank), plus builds of that value. With nothing picked, it takes the most it can. Clearing the table is a **sweep**.
- **Build *N***: combine your card with the picked cards (and/or one build) into a total of 10 or less that you hold another card for. A badge shows the build's value and owner. The other player can capture it or raise it.
- **Trail**: lay the card on the table. Not allowed while you own a build, and you can't use up the card you're saving for it.

Dragging a card up plays it the quick way: capture what you picked (or the most it can), otherwise trail. When the deck is done, the last player to capture takes what's left. Each round scores most cards 3, most spades 1, big casino (10♦) 2, little casino (2♠) 1, aces 1 each and sweeps 1 each, shown in a scoreboard; first to 21 wins. The CPU weighs captures by what they're worth (the casinos, aces, spades, sweeps), builds when it can steal or bank cards, and trails cheap cards that don't set you up. The game is saved after every move.

## Euchre

Four players in two partnerships, like Spades: you (South) and your partner (North) against West and East; pass-and-play seats 2–4 people and fills the rest with CPUs. 24 cards (9 to ace), 5 each, and an upcard turned from the kitty. **Calling trump**: in round one a panel asks whether to **order up** the upcard's suit (the dealer picks it up and discards by dragging a card up) or pass; if everyone passes, round two lets you **name** any other suit (shown as suit buttons) or pass, and the dealer must call (*stick the dealer*). Toggle **Go alone** before calling to play without your partner, whose cards are dimmed while they sit out. Trump shows as a badge next to the title. The **right bower** (jack of trump) is highest, then the **left bower** (the other jack of the same color, which counts as trump), then A, K, Q, 10, 9. Play like the other trick games (drag up, flick, or tap + *Play*); follow suit if you can, and illegal cards are dimmed and snap back with the reason. The makers score 1 for 3–4 tricks, 2 for all five (4 alone); taking fewer than 3 is a **euchre** and the defenders score 2. First team to 10 wins. The CPUs value their hands by bowers, trump, off-suit aces and voids (counting whether the upcard helps their partner or the other side), go alone with very strong hands, pull trump with the right bower when they called, and duck when their partner is winning. The game is saved after every move.

## Known limitations

- Multiplayer is pass-and-play on one device. There's no online play: the app is a static site without a server.

- **Haptics:** this uses `navigator.vibrate`, which iOS Safari does not support, so it only works on Android Chrome. The native app should use `UIImpactFeedbackGenerator` / `UISelectionFeedbackGenerator` at the same points: pick-up, scrub slot change, gap change and play.
- Hand cards are hit-tested by layout (x against slot positions), not by each card's rotated shape. This is intentional, because it keeps scrubbing smooth.
- On desktop, the rotation animation spins the frame and then re-lays out the content, so the content is not crossfaded the way iOS does it.
- Fullscreen in mobile Safari with the browser chrome visible still shows the toolbar. Use Add to Home Screen for true fullscreen.
