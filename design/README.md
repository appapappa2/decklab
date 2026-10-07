# The Deck Lab: hand feel prototype

A browser lab for tuning how the cards in the player's hand feel before building it natively for iPhone. It uses plain HTML, CSS and JS: no dependencies and no build step.

## Run

ES modules need to be served over HTTP, not `file://`:

```sh
cd thedeck-lab
python3 -m http.server 8000
```

- **Desktop:** open <http://localhost:8000>. You get an emulated iPhone 15 frame (393×852) with the lab panel on the right.
- **iPhone:** make sure the phone and computer are on the same Wi‑Fi. Find your Mac's IP with `ipconfig getifaddr en0`, then open `http://<ip>:8000` in Safari. It runs fullscreen and follows real orientation changes. For a true fullscreen experience, use Share → *Add to Home Screen*.
- **Force a mode:** add `?mode=phone` or `?mode=desktop`.

Desktop shortcuts: <kbd>R</kbd> rotates the frame, <kbd>G</kbd> toggles the debug overlay, <kbd>Space</kbd> draws a card.

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
src/main.js     wiring, rAF loop, panel actions, shortcuts
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

## Known limitations

- **Haptics:** this uses `navigator.vibrate`, which iOS Safari does not support, so it only works on Android Chrome. The native app should use `UIImpactFeedbackGenerator` / `UISelectionFeedbackGenerator` at the same points: pick-up, scrub slot change, gap change and play.
- Hand cards are hit-tested by layout (x against slot positions), not by each card's rotated shape. This is intentional, because it keeps scrubbing smooth.
- On desktop, the rotation animation spins the frame and then re-lays out the content, so the content is not crossfaded the way iOS does it.
- Fullscreen in mobile Safari with the browser chrome visible still shows the toolbar. Use Add to Home Screen for true fullscreen.
