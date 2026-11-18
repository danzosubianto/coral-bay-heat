// config.js — every tuning number and colour for Coral Bay Heat lives here, so
// the rest of the code can stay about behaviour instead of magic values.

export const WORLD = {
  width: 3360,          // px, west edge is the bay promenade
  height: 2520,         // px, south edge is the beach
  block: 280,           // city block pitch (road + parcel)
  road: 92,             // road width in px
  lane: 23,             // lane offset from road centre
};

export const PLAYER = {
  radius: 11,
  walkSpeed: 168,       // px/s on foot
  runSpeed: 252,
  health: 100,
  punchRange: 30,
  punchDamage: 34,
};

export const CAR = {
  length: 46,
  width: 22,
  accel: 340,           // px/s^2
  brake: 520,
  reverse: 130,
  grip: 7.5,            // lateral velocity kept per second
  turnRate: 2.6,        // rad/s at full lock, scaled by speed
  health: 100,
};

export const WANTED = {
  maxStars: 5,
  decaySeconds: 26,     // unseen time for one star to cool off
  bustSeconds: 2.4,     // stopped-and-surrounded time that ends a run
  copPerStar: 1,        // extra cruisers per star beyond the first pair
};

export const ECONOMY = {
  startCash: 120,
  farePerMeter: 0.055,  // taxi pay per px travelled, scaled down in missions.js
  wreckBonus: 45,
};

// A sun-soaked palette: coral roofs, teal water, bleached asphalt.
export const PALETTE = {
  water: '#1d7f96',
  waterDeep: '#146074',
  sand: '#ecd9a0',
  grass: '#79b657',
  grassDark: '#679c49',
  asphalt: '#4a4d55',
  asphaltDark: '#3e4048',
  sidewalk: '#c9c2b4',
  laneMark: '#e8e2c8',
  crosswalk: '#ddd6c2',
  roofA: '#e2725b',
  roofB: '#d95f76',
  roofC: '#e8a04c',
  roofD: '#7fb3b0',
  roofE: '#c96f4a',
  wallShade: 'rgba(60, 30, 20, 0.35)',
  palmTrunk: '#8a6b46',
  palmLeaf: '#3f9142',
  carColors: [
    '#e74c3c', '#f39c12', '#f5f0e1', '#3498db', '#2ecc71', '#9b59b6',
    '#ecf0f1', '#95a5a6', '#e67e22', '#1abc9c', '#fd79a8', '#636e72',
  ],
  copBody: '#f2f4f6',
  copTrim: '#1c2f6e',
  taxiBody: '#f7b731',
  playerShirt: '#ff5964',
  playerPants: '#274156',
  pedShirts: ['#ffeaa7', '#81ecec', '#fab1a0', '#a29bfe', '#55efc4', '#ff7675', '#74b9ff', '#dfe6e9'],
};

export const DAY = {
  cycleSeconds: 420,    // a full day/night tint cycle
  startPhase: 0.32,     // begin in late-afternoon gold
};
