// Game catalog shown in the lobby.
//   modes:   which lobby modes list the game ('single' and/or 'multi')
//   ready:   modes that are playable now; other modes show "Soon"
//   players: shown as a hint, e.g. '2–4'
//   cpu:     singleplayer is against CPUs: true reads "vs CPU", or give the text
//   multiNote: what the multiplayer line says instead of "N players"
//   route:   hash route to open when the game is ready in the chosen mode
//   tag:     short line under the title in the lobby carousel
//   color:   the game's own color: its cover and its accents on the table
//   pop:     the partner color: the cover's sticker and card backs, highlights
//            (both are one of 'red' | 'green' | 'blue' | 'yellow')
export const GAMES = [
  { id: 'stress', name: 'Stress', blurb: 'No turns: empty your four cards first, and call Stress when the piles match.', modes: ['single'], ready: ['single'], players: '2', cpu: 'vs CPU · real time', route: '#/play/stress', tag: 'Call it when the piles match', color: 'blue', pop: 'yellow' },
  { id: 'palace', name: 'Palace', blurb: "Get rid of your cards. Don't be the last one holding them.", modes: ['single', 'multi'], ready: ['single', 'multi'], players: '2–4', cpu: 'vs 1–3 CPUs', multiNote: '2–4 players · pass and play', route: '#/play/palace', tag: '2 resets · 10 burns', color: 'red', pop: 'yellow' },
  { id: 'solitaire', name: 'Solitaire', blurb: 'Classic patience. Clear the tableau.', modes: ['single'], ready: ['single'], players: '1', route: '#/play/solitaire', tag: 'Klondike · draw 1 or 3', color: 'green', pop: 'yellow' },
  { id: 'gin', name: 'Gin Rummy', blurb: 'Draw, discard, meld. Knock with ten or less, or go gin.', modes: ['single', 'multi'], ready: ['single', 'multi'], players: '2', cpu: true, multiNote: '2 players · pass and play', route: '#/play/gin', tag: 'Knock, gin, undercut', color: 'red', pop: 'yellow' },
  { id: 'crazy-eights', name: 'Crazy Eights', blurb: 'Match suit or rank. Eights are wild.', modes: ['single', 'multi'], ready: ['single'], players: '2–5', cpu: true, route: '#/play/crazy-eights', tag: 'Eights are wild', color: 'blue', pop: 'yellow' },
  { id: 'speed', name: 'Speed', blurb: 'No turns: race the CPU, one up or one down.', modes: ['single'], ready: ['single'], players: '2', cpu: 'vs CPU · real time', route: '#/play/speed', tag: 'One up or one down', color: 'red', pop: 'yellow' },
  { id: 'slapjack', name: 'Slapjack', blurb: 'Flip in turn and slap every jack before anyone else.', modes: ['single', 'multi'], ready: ['single', 'multi'], players: '2–4', cpu: 'vs 1–3 CPUs · reflexes', multiNote: '2 players · one device', route: '#/play/slapjack', tag: 'Fastest hand wins', color: 'yellow', pop: 'red' },
  { id: 'casino', name: 'Casino', blurb: 'Capture by rank and by sums, build ahead, sweep the table.', modes: ['single', 'multi'], ready: ['single', 'multi'], players: '2', cpu: true, multiNote: '2 players · pass and play', route: '#/play/casino', tag: 'Big casino is the 10♦', color: 'blue', pop: 'yellow' },
  { id: 'go-fish', name: 'Go Fish!', blurb: 'Ask for ranks and collect sets of four.', modes: ['single', 'multi'], ready: ['single'], players: '2–6', cpu: true, route: '#/play/go-fish', tag: 'Got any sevens?', color: 'yellow', pop: 'blue' },
  { id: 'blackjack', name: 'Blackjack', blurb: 'Beat the dealer to 21 without going over.', modes: ['single'], ready: ['single'], players: '1', cpu: 'vs dealer', route: '#/play/blackjack', tag: 'Blackjack pays 3 to 2', color: 'green', pop: 'yellow' },
  { id: 'war', name: 'War', blurb: 'Flip cards. Highest card takes both.', modes: ['single', 'multi'], ready: ['single'], players: '2', cpu: true, route: '#/play/war', tag: 'Highest card wins', color: 'red', pop: 'yellow' },
];

// Developer-only entries reached from the lobby's Dev menu.
export const DEV_ITEMS = [
  { id: 'hand-feel', name: 'Hand feel', blurb: 'Hand gestures, springs, and the tuning panel.', route: '#/dev/hand-feel' },
];
