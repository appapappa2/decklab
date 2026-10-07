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
| Tap a card | Toggle selected |
| Drag upward | Card detaches and follows your finger (offset above it) and tilts with horizontal velocity |
| Release above the play line or over the play zone | Plays the card |
| Fast upward flick | Plays the card even if it's below the line |
| Drag sideways while low (in the hand zone) | Reorder: the other cards open a gap live |
| Long-press a card | Pick it up without moving (useful for reordering) |
| Tap the deck / tap the pile | Draw a card / return played cards to the hand |

## Architecture

```
index.html      markup: device frame, screen, table, panel
style.css       frame, felt, cards (DOM/CSS only), panel, phone fullscreen
src/main.js     wiring, rAF loop, panel actions, shortcuts
src/device.js   desktop frame (scale-to-fit, rotation, emulated safe areas) vs phone fullscreen (env() safe areas)
src/game.js     deck/hand/pile state → per-frame spring targets; play/draw/sort/return
src/input.js    pointer gesture state machine (press → scrub → drag / tap / long-press)
src/layout.js   pure layout math: metrics, fan/line/stack slots, nearest-slot picking
src/cards.js    deck data + CardSprite (DOM + springs, transform-only rendering)
src/spring.js   damped spring with fixed 1/240 s sub-steps (stable at 60/120 Hz)
src/velocity.js windowed pointer velocity (drives tilt + flick)
src/settings.js schema, defaults, presets, localStorage, auto-generated panel
src/debug.js    overlay: play line, hand zone, slots, pick points, finger, FPS
```

The game code only sees `(width, height, safeArea)`, so the emulated frame and a real phone run the same path. All card motion is spring-driven. Each frame sets targets from state, steps the springs, and writes `transform` only when the value changed. Nothing reads layout inside the loop.

## Lab settings

All settings persist to `localStorage`. Double-click a label to reset that setting, or use **Reset to defaults**. Presets: *Balatro-ish*, *Hearthstone-ish*, *Flat & snappy*, *Tight stack*.

Units: **cw** = card widths, **ch** = card heights.

- **Layout:** mode (fan / line / stack), card size, max spacing (compresses automatically to fit), hand width, how much of the hand is hidden below the edge, fan radius (smaller means more curve), fan tilt, stack idle spacing (stack spreads out while touched).
- **Peek / scrub:** on/off, lift (above the fully visible position), scale, straighten, neighbor spread and falloff (multiplier per card), pick bias (0% = nearest card center, 100% = the visible strip of overlapped cards), hysteresis (resists flicker between two cards).
- **Select:** lift, multi-select.
- **Drag:** pull-out threshold (px of deliberate upward motion), long-press time (0 = off), finger offset, drag scale, velocity tilt (degrees per 1000 px/s; negative flips the direction), max tilt, reorder on/off.
- **Play:** play line (fraction of screen height), flick-to-play, flick velocity.
- **Motion:** hand spring stiffness and damping ratio, a separate stiffer spring for the dragged card, deal stagger.
- **Feedback:** haptics, debug overlay.

## Known limitations

- **Haptics:** this uses `navigator.vibrate`, which iOS Safari does not support, so it only works on Android Chrome. The native app should use `UIImpactFeedbackGenerator` / `UISelectionFeedbackGenerator` at the same points: pick-up, scrub slot change, gap change and play.
- Hand cards are hit-tested by layout (x against slot positions), not by each card's rotated shape. This is intentional, because it keeps scrubbing smooth.
- On desktop, the rotation animation spins the frame and then re-lays out the content, so the content is not crossfaded the way iOS does it.
- Fullscreen in mobile Safari with the browser chrome visible still shows the toolbar. Use Add to Home Screen for true fullscreen.
