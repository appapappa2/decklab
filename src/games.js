// Game catalog shown in the lobby.
//   modes:   which lobby modes list the game ('single' and/or 'multi')
//   ready:   modes that are playable now; other modes show "Soon"
//   players: shown as a hint, e.g. '2–4'
//   cpu:     singleplayer is against CPUs: true reads "vs CPU", or give the text
//   route:   hash route to open when the game is ready in the chosen mode
export const GAMES = [
  { id: 'solitaire', name: 'Solitaire', blurb: 'Classic patience. Clear the tableau.', modes: ['single'], ready: ['single'], players: '1', route: '#/play/solitaire' },
  { id: 'crazy-eights', name: 'Crazy Eights', blurb: 'Match suit or rank. Eights are wild.', modes: ['single', 'multi'], ready: ['single'], players: '2–5', cpu: true, route: '#/play/crazy-eights' },
  { id: 'go-fish', name: 'Go Fish', blurb: 'Ask for ranks and collect sets of four.', modes: ['single', 'multi'], ready: ['single'], players: '2–6', cpu: true, route: '#/play/go-fish' },
  { id: 'war', name: 'War', blurb: 'Flip cards. Highest card takes both.', modes: ['single', 'multi'], ready: ['single'], players: '2', cpu: true, route: '#/play/war' },
  { id: 'blackjack', name: 'Blackjack', blurb: 'Beat the dealer to 21 without going over.', modes: ['single'], ready: ['single'], players: '1', cpu: 'vs dealer', route: '#/play/blackjack' },
  { id: 'hearts', name: 'Hearts', blurb: 'Avoid hearts and the queen of spades.', modes: ['single', 'multi'], ready: ['single'], players: '4', cpu: 'vs 3 CPUs', route: '#/play/hearts' },
];

// Developer-only entries reached from the lobby's Dev menu.
export const DEV_ITEMS = [
  { id: 'hand-feel', name: 'Hand feel', blurb: 'Hand gestures, springs, and the tuning panel.', route: '#/dev/hand-feel' },
];
