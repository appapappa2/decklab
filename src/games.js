// Game catalog shown in the lobby.
//   modes:   which lobby modes list the game ('single' and/or 'multi')
//   ready:   modes that are playable now; other modes show "Soon"
//   players: shown as a hint, e.g. '2–4'
//   cpu:     singleplayer is against CPUs: true reads "vs CPU", or give the text
//   multiNote: what the multiplayer line says instead of "N players"
//   route:   hash route to open when the game is ready in the chosen mode
//   tag:     short line under the title in the lobby carousel
//   colors:  [cover, background disc, background edge] for the lobby carousel
export const GAMES = [
  { id: 'solitaire', name: 'Solitaire', blurb: 'Classic patience. Clear the tableau.', modes: ['single'], ready: ['single'], players: '1', route: '#/play/solitaire', tag: 'Klondike · draw 1 or 3', colors: ['#2f8f5b', '#ffb53d', '#ef7fb0'] },
  { id: 'crazy-eights', name: 'Crazy Eights', blurb: 'Match suit or rank. Eights are wild.', modes: ['single', 'multi'], ready: ['single'], players: '2–5', cpu: true, route: '#/play/crazy-eights', tag: 'Eights are wild', colors: ['#5d5bd8', '#8f8cff', '#f48fc0'] },
  { id: 'go-fish', name: 'Go Fish', blurb: 'Ask for ranks and collect sets of four.', modes: ['single', 'multi'], ready: ['single'], players: '2–6', cpu: true, route: '#/play/go-fish', tag: 'Got any sevens?', colors: ['#1aa5a5', '#5fe0c8', '#7da8ff'] },
  { id: 'war', name: 'War', blurb: 'Flip cards. Highest card takes both.', modes: ['single', 'multi'], ready: ['single'], players: '2', cpu: true, route: '#/play/war', tag: 'Highest card wins', colors: ['#d8443a', '#ff6a3d', '#ffc04a'] },
  { id: 'blackjack', name: 'Blackjack', blurb: 'Beat the dealer to 21 without going over.', modes: ['single'], ready: ['single'], players: '1', cpu: 'vs dealer', route: '#/play/blackjack', tag: 'Blackjack pays 3 to 2', colors: ['#17613f', '#3fcf86', '#f5d34a'] },
  { id: 'rummy-500', name: 'Rummy 500', blurb: 'Meld sets and runs. First to 500 wins.', modes: ['single', 'multi'], ready: ['single', 'multi'], players: '2–4', cpu: 'vs 1–3 CPUs', multiNote: '2–4 players · pass and play', route: '#/play/rummy-500', tag: 'Dig deep in the discard pile', colors: ['#c98a1c', '#ffd257', '#4fb3a9'] },
  { id: 'shithead', name: 'Shithead', blurb: "Get rid of your cards. Don't be the last one holding them.", modes: ['single', 'multi'], ready: ['single', 'multi'], players: '2–4', cpu: 'vs 1–3 CPUs', multiNote: '2–4 players · pass and play', route: '#/play/shithead', tag: '2 resets · 10 burns', colors: ['#7b4a2a', '#e8a46a', '#7fc8a9'] },
  { id: 'spades', name: 'Spades', blurb: 'Bid your tricks with a partner. Spades are trump.', modes: ['single', 'multi'], ready: ['single', 'multi'], players: '4', cpu: 'with a CPU partner', multiNote: '2–4 players · pass and play', route: '#/play/spades', tag: 'Make your bid, dodge the bags', colors: ['#24304a', '#7d93c8', '#e0b95a'] },
  { id: 'speed', name: 'Speed', blurb: 'No turns: race the CPU, one up or one down.', modes: ['single'], ready: ['single'], players: '2', cpu: 'vs CPU · real time', route: '#/play/speed', tag: 'Also known as Stress', colors: ['#c2272d', '#ff7a45', '#ffd257'] },
  { id: 'beggar', name: 'Beggar-my-neighbour', blurb: 'Flip and pay up for every court card. Take the pile.', modes: ['single', 'multi'], ready: ['single', 'multi'], players: '2–4', cpu: 'vs 1–3 CPUs', multiNote: '2–4 players · one device', route: '#/play/beggar', tag: 'Aces cost four', colors: ['#5b2a6e', '#c58ae0', '#f2b84b'] },
  { id: 'cribbage', name: 'Cribbage', blurb: 'Fifteen two, fifteen four… Peg your way to 121.', modes: ['single', 'multi'], ready: ['single', 'multi'], players: '2', cpu: true, multiNote: '2 players · pass and play', route: '#/play/cribbage', tag: 'Fifteen two, fifteen four', colors: ['#8a5a2b', '#e9c48a', '#6fae8f'] },
  { id: 'hearts', name: 'Hearts', blurb: 'Avoid hearts and the queen of spades.', modes: ['single', 'multi'], ready: ['single'], players: '4', cpu: 'vs 3 CPUs', route: '#/play/hearts', tag: 'Dodge the queen', colors: ['#e5578a', '#ff8fb8', '#b07dff'] },
];

// Developer-only entries reached from the lobby's Dev menu.
export const DEV_ITEMS = [
  { id: 'hand-feel', name: 'Hand feel', blurb: 'Hand gestures, springs, and the tuning panel.', route: '#/dev/hand-feel' },
];
