// Game catalog shown in the lobby.
//   modes:   which lobby modes list the game ('single' and/or 'multi')
//   ready:   modes that are playable now; other modes show "Soon"
//   players: shown as a hint, e.g. '2–4'
//   cpu:     singleplayer is against a CPU (the hint reads "vs CPU")
//   route:   hash route to open when the game is ready in the chosen mode
export const GAMES = [
  { id: 'solitaire', name: 'Solitaire', blurb: 'Classic patience. Clear the tableau.', modes: ['single'], ready: ['single'], players: '1', route: '#/play/solitaire' },
  { id: 'crazy-eights', name: 'Crazy Eights', blurb: 'Match suit or rank. Eights are wild.', modes: ['single', 'multi'], players: '2–5' },
  { id: 'go-fish', name: 'Go Fish', blurb: 'Ask for ranks and collect sets of four.', modes: ['single', 'multi'], players: '2–6' },
  { id: 'war', name: 'War', blurb: 'Flip cards. Highest card takes both.', modes: ['single', 'multi'], ready: ['single'], players: '2', cpu: true, route: '#/play/war' },
  { id: 'hearts', name: 'Hearts', blurb: 'Avoid hearts and the queen of spades.', modes: ['multi'], players: '4' },
];

// Developer-only entries reached from the lobby's Dev menu.
export const DEV_ITEMS = [
  { id: 'hand-feel', name: 'Hand feel', blurb: 'Hand gestures, springs, and the tuning panel.', route: '#/dev/hand-feel' },
];
