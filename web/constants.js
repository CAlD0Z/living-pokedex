'use strict';

const TYPE_COLORS = {
  Normal: '#9fa19f', Fire: '#e62829', Water: '#2980ef', Electric: '#fac000',
  Grass: '#3fa129', Ice: '#3fd8ff', Fighting: '#ff8000', Poison: '#9141cb',
  Ground: '#915121', Flying: '#81b9ef', Psychic: '#ef4179', Bug: '#91a119',
  Rock: '#afa981', Ghost: '#704170', Dragon: '#5060e1', Dark: '#624d4e',
  Steel: '#60a1b8', Fairy: '#ef70ef',
};

const REGIONS = [
  { key: 'kanto',          label: 'Kanto'          },
  { key: 'johto',          label: 'Johto'          },
  { key: 'hoenn',          label: 'Hoenn'          },
  { key: 'sinnoh',         label: 'Sinnoh'         },
  { key: 'unova',          label: 'Unova'          },
  { key: 'kalos',          label: 'Kalos'          },
  { key: 'alola',          label: 'Alola'          },
  { key: 'galar',          label: 'Galar'          },
  { key: 'hisui',          label: 'Hisui'          },
  { key: 'paldea',         label: 'Paldea'         },
  { key: 'lumiose',        label: 'Lumiose'        },
  { key: 'hyperspace',     label: 'Hyperspace'     },
  { key: 'mega-evolution', label: 'Mega Evolution' },
];

const GROUP_REGION = {
  HOME: '/dex',
  LZA:  '/dex/lumiose',
  RBY:  '/dex/kanto',
  GSC:  '/dex/johto',
  RSE:  '/dex/hoenn',
  FRLG: '/dex/kanto',
  DPPT: '/dex/sinnoh',
  HGSS: '/dex/johto',
  BW:   '/dex/unova',
  BW2:  '/dex/unova',
  XY:   '/dex/kalos',
  ORAS: '/dex/hoenn',
  SM:   '/dex/alola',
  USUM: '/dex/alola',
  LGPE: '/dex/kanto',
  SwSh: '/dex/galar',
  BDSP: '/dex/sinnoh',
  PLA:  '/dex/hisui',
  SV:   '/dex/paldea',
  IoA:  '/dex/isle-of-armor',
  CT:   '/dex/crown-tundra',
  Kita: '/dex/kitakami',
  BB:   '/dex/blueberry',
  HOME_KANTO:   '/dex/kanto',
  HOME_JOHTO:   '/dex/johto',
  HOME_HOENN:   '/dex/hoenn',
  HOME_SINNOH:  '/dex/sinnoh',
  HOME_UNOVA:   '/dex/unova',
  HOME_KALOS:   '/dex/kalos',
  HOME_ALOLA:   '/dex/alola',
  HOME_GALAR:   '/dex/galar',
  HOME_IOA:     '/dex/isle-of-armor',
  HOME_CT:      '/dex/crown-tundra',
  HOME_HISUI:   '/dex/hisui',
  HOME_KITA:    '/dex/kitakami',
  HOME_BB:      '/dex/blueberry',
  HOME_PALDEA:  '/dex/paldea',
  HOME_LUMIOSE: '/dex/lumiose',
  HOME_HYPER:   '/dex/hyperspace',
  HOME_MEGA:    '/dex/mega-evolution',
};

const GAME_LOGOS = {
  Yellow:             '/logos/yellow.png',
  Crystal:            '/logos/crystal.png',
  Ruby:               '/logos/ruby.png',
  Sapphire:           '/logos/sapphire.png',
  Emerald:            '/logos/emerald.png',
  FireRed:            '/logos/firered.png',
  LeafGreen:          '/logos/leafgreen.png',
  Diamond:            '/logos/diamond.png',
  Pearl:              '/logos/pearl.png',
  Platinum:           '/logos/platinum.png',
  HeartGold:          '/logos/heartgold.png',
  SoulSilver:         '/logos/soulsilver.png',
  Black:              '/logos/black.png',
  White:              '/logos/white.png',
  'Black 2':          '/logos/black2.png',
  'White 2':          '/logos/white2.png',
  X:                  '/logos/xy.png',
  Y:                  '/logos/xy.png',
  'Omega Ruby':       '/logos/omegaruby.png',
  'Alpha Sapphire':   '/logos/alphasapphire.png',
  Sun:                '/logos/sunmoon.png',
  Moon:               '/logos/sunmoon.png',
  'Ultra Sun':        '/logos/ultrasun.png',
  'Ultra Moon':       '/logos/ultramoon.png',
  "Let's Go Pikachu": '/logos/letsgopikachu.png',
  "Let's Go Eevee":   '/logos/letsgoeevee.png',
  Sword:              '/logos/sword.png',
  Shield:             '/logos/shield.png',
  'Brilliant Diamond':'/logos/brilliantdiamond.png',
  'Shining Pearl':    '/logos/shiningpearl.png',
  'Legends: Arceus':  '/logos/legendsarceus.png',
  Scarlet:            '/logos/scarlet.png',
  Violet:             '/logos/violet.png',
  'Legends: Z-A':     '/logos/legendsza.png',
};

const GROUP_LABELS = {
  HOME: 'Pokémon Home',
  RBY:  'Red / Blue / Yellow',
  GSC:  'Gold / Silver / Crystal',
  RSE:  'Ruby / Sapphire / Emerald',
  FRLG: 'FireRed / LeafGreen',
  DPPT: 'Diamond / Pearl / Platinum',
  HGSS: 'HeartGold / SoulSilver',
  BW:   'Black / White',
  BW2:  'Black 2 / White 2',
  XY:   'X / Y',
  ORAS: 'Omega Ruby / Alpha Sapphire',
  SM:   'Sun / Moon',
  USUM: 'Ultra Sun / Ultra Moon',
  LGPE: "Let's Go Pikachu / Eevee",
  SwSh: 'Sword / Shield',
  BDSP: 'Brilliant Diamond / Shining Pearl',
  PLA:     'Legends: Arceus',
  LZA:     'Legends: Z-A',
  Legends: 'Legends',
  SV:   'Scarlet / Violet',
  IoA:  'Isle of Armor',
  CT:   'Crown Tundra',
  Kita: 'Kitakami',
  BB:   'Blueberry',
};

const GAME_ABBR = {
  Red: 'R', Blue: 'B', Yellow: 'Y',
  Gold: 'G', Silver: 'S', Crystal: 'C',
  Ruby: 'R', Sapphire: 'S', Emerald: 'E',
  FireRed: 'FR', LeafGreen: 'LG',
  Diamond: 'D', Pearl: 'P', Platinum: 'Pt',
  HeartGold: 'HG', SoulSilver: 'SS',
  Black: 'B', White: 'W',
  'Black 2': 'B2', 'White 2': 'W2',
  X: 'X', Y: 'Y',
  'Omega Ruby': 'OR', 'Alpha Sapphire': 'AS',
  Sun: 'Su', Moon: 'Mo',
  'Ultra Sun': 'US', 'Ultra Moon': 'UM',
  "Let's Go Pikachu": 'P', "Let's Go Eevee": 'E',
  'Brilliant Diamond': 'BD', 'Shining Pearl': 'SP',
  Sword: 'Sw', Shield: 'Sh',
  Scarlet: 'Sc', Violet: 'V',
  'SW - Isle of Armor': 'Sw', 'SH - Isle of Armor': 'Sh',
  'SW - Crown Tundra': 'Sw',  'SH - Crown Tundra': 'Sh',
  'S - Kitakami': 'Sc', 'V - Kitakami': 'V',
  'S - Blueberry': 'Sc', 'V - Blueberry': 'V',
};

const DISPLAY_GROUP = {
  IoA:  'SwSh',
  CT:   'SwSh',
  Kita: 'SV',
  BB:   'SV',
};

const DLC_GROUPS = new Set(Object.keys(DISPLAY_GROUP));

// Forms within the 'Other' tag that are battle-only transformations or
// non-catchable event forms — excluded from the Shiny Dex expanded view.
const SHINY_DEX_FORM_EXCLUSIONS = new Set([
  '25_1',   '133_1',                       // Partner Pikachu / Eevee (LGPE event)
  '351_1',  '351_2',  '351_3',             // Castform weather forms
  '555_1',                                  // Darmanitan Zen Mode
  '658_1',                                  // Ash-Greninja
  '746_1',                                  // Wishiwashi School Form
  '774_1',                                  // Minior Core Form
  '800_1',  '800_2',  '800_3',             // Necrozma fusions + Ultra
  '875_1',                                  // Eiscue Noice Face
  '877_1',                                  // Morpeko Hangry Mode
  '890_1',                                  // Eternamax Eternatus
  '1024_1', '1024_2',                       // Terapagos Terastal / Stellar
]);

const HOME_SHINY_DEXES = new Set([
  'HOME_KANTO', 'HOME_SINNOH', 'HOME_GALAR', 'HOME_IOA', 'HOME_CT', 'HOME_HISUI',
  'HOME_PALDEA', 'HOME_KITA', 'HOME_BB',
  'HOME_LUMIOSE', 'HOME_HYPER', 'HOME_MEGA',
]);

const HOME_GAME_SUBGROUPS = [
  { label: "Let's Go",         groups: ['HOME_KANTO'] },
  { label: 'Sword / Shield',   groups: ['HOME_GALAR', 'HOME_IOA', 'HOME_CT'] },
  { label: 'BDSP',             groups: ['HOME_SINNOH'] },
  { label: 'Legends: Arceus',  groups: ['HOME_HISUI'] },
  { label: 'Scarlet / Violet', groups: ['HOME_PALDEA', 'HOME_KITA', 'HOME_BB'] },
  { label: 'Legends: Z-A',     groups: ['HOME_LUMIOSE', 'HOME_HYPER', 'HOME_MEGA'] },
];

const HOME_GAME_SUBGROUP_LABELS = {
  HOME_KANTO:   'Kanto',
  HOME_SINNOH:  'Sinnoh',
  HOME_GALAR:   'Galar',
  HOME_IOA:     'Isle of Armor',
  HOME_CT:      'Crown Tundra',
  HOME_HISUI:   'Hisui',
  HOME_PALDEA:  'Paldea',
  HOME_KITA:    'Kitakami',
  HOME_BB:      'Blueberry',
  HOME_LUMIOSE: 'Lumiose',
  HOME_HYPER:   'Hyperspace',
  HOME_MEGA:    'Mega Evolution',
};

const GAME_COLORS = {
  Red: '#F0594E', Blue: '#5B9BFF', Yellow: '#F0CB2E', Green: '#5FBF66',
  Gold: '#E0B53A', Silver: '#B8BFC6', Crystal: '#5FC7D6',
  Ruby: '#F0594E', Sapphire: '#5B9BFF', Emerald: '#3DC971',
  FireRed: '#F0594E', LeafGreen: '#5FBF66',
  Diamond: '#9DC4E8', Pearl: '#F0A8C4', Platinum: '#AEB6BD',
  HeartGold: '#E0B53A', SoulSilver: '#B8BFC6',
  Black: '#9AA0A6', White: '#D6DAE0',
  'Black 2': '#A98CE0', 'White 2': '#6FD0F0',
  X: '#5B9BFF', Y: '#F0594E',
  'Omega Ruby': '#F0594E', 'Alpha Sapphire': '#5B9BFF',
  Sun: '#F0A03A', Moon: '#6E8FE0',
  'Ultra Sun': '#F08A3A', 'Ultra Moon': '#6E8FE0',
  "Let's Go Pikachu": '#F0CB2E', "Let's Go Eevee": '#C99A5E',
  'Brilliant Diamond': '#9DC4E8', 'Shining Pearl': '#F0A8C4',
  Sword: '#3AB6F0', Shield: '#F0594E',
  'Legends: Arceus': '#8BBFAD',
  Scarlet: '#F0594E', Violet: '#B07AE0',
  'SW - Isle of Armor': '#3AB6F0', 'SH - Isle of Armor': '#F0594E',
  'SW - Crown Tundra': '#3AB6F0',  'SH - Crown Tundra': '#F0594E',
  'S - Kitakami': '#F0594E', 'V - Kitakami': '#B07AE0',
  'S - Blueberry': '#F0594E', 'V - Blueberry': '#B07AE0',
};

const EXCL_COLOR_DEFAULT = '#e0b020';

const DLC_TABS = {
  SwSh: [
    { label: 'Base',          dlc: null   },
    { label: 'Isle of Armor', dlc: 'ioa'  },
    { label: 'Crown Tundra',  dlc: 'ct'   },
  ],
  SV: [
    { label: 'Base',          dlc: null   },
    { label: 'Kitakami',      dlc: 'kita' },
    { label: 'Blueberry',     dlc: 'bb'   },
  ],
  LZA: [
    { label: 'Lumiose',       dlc: null    },
    { label: 'Hyperspace',    dlc: 'hyper' },
    { label: 'Mega Evolution', dlc: 'mega' },
  ],
};

const REGION_PARENT_GROUP = {
  galar:   'SwSh',
  paldea:  'SV',
  lumiose: 'LZA',
};

const REGION_VALID_DLCS = {
  galar:   ['ioa', 'ct'],
  paldea:  ['kita', 'bb'],
  lumiose: ['hyper', 'mega'],
};

const DLC_DEX_CONFIG = {
  ioa:   { table: 'isle_of_armor_dex', label: 'Isle of Armor',  game_group: 'IoA'  },
  ct:    { table: 'crown_tundra_dex',  label: 'Crown Tundra',   game_group: 'CT'   },
  kita:  { table: 'kitakami_dex',      label: 'Kitakami',       game_group: 'Kita' },
  bb:    { table: 'blueberry_dex',     label: 'Blueberry',      game_group: 'BB'   },
  hyper: { table: 'hyperspace',        label: 'Hyperspace',     game_group: 'LZA'  },
  mega:  { table: 'mega-evolution',    label: 'Mega Evolution',  game_group: 'LZA'  },
};

const DLC_REGIONS = [
  { key: 'isle-of-armor', table: 'isle_of_armor_dex', label: 'Isle of Armor', game_group: 'IoA'  },
  { key: 'crown-tundra',  table: 'crown_tundra_dex',  label: 'Crown Tundra',  game_group: 'CT'   },
  { key: 'kitakami',      table: 'kitakami_dex',       label: 'Kitakami',      game_group: 'Kita' },
  { key: 'blueberry',     table: 'blueberry_dex',      label: 'Blueberry',     game_group: 'BB'   },
];

const GROUP_DEX_KEY = {
  HOME: null,
  RBY: 'kanto', FRLG: 'kanto', LGPE: 'kanto',
  GSC: 'johto', HGSS: 'johto',
  RSE: 'hoenn', ORAS: 'hoenn',
  DPPT: 'sinnoh', BDSP: 'sinnoh',
  BW: 'unova', BW2: 'unova',
  XY: 'kalos',
  SM: 'alola', USUM: 'alola',
  SwSh: 'galar',
  PLA: 'hisui',
  LZA: 'lumiose',
  SV: 'paldea',
  IoA: 'isle_of_armor',
  CT: 'crown_tundra',
  Kita: 'kitakami',
  BB: 'blueberry',
  HOME_KANTO: 'kanto', HOME_JOHTO: 'johto', HOME_HOENN: 'hoenn',
  HOME_SINNOH: 'sinnoh', HOME_UNOVA: 'unova', HOME_KALOS: 'kalos',
  HOME_ALOLA: 'alola', HOME_GALAR: 'galar', HOME_IOA: 'isle_of_armor',
  HOME_CT: 'crown_tundra', HOME_HISUI: 'hisui', HOME_KITA: 'kitakami',
  HOME_BB: 'blueberry', HOME_PALDEA: 'paldea', HOME_LUMIOSE: 'lumiose',
  HOME_HYPER: 'hyperspace', HOME_MEGA: 'mega-evolution',
};

// Game groups with paired versions that get an "All" combined sidebar option.
const PAIRED_GAME_GROUPS = new Set(['LGPE', 'SwSh', 'BDSP', 'SV']);

// Maps the primary HOME sub-group key → corresponding regular game group.
// Used so HOME sidebar sub-group buttons navigate to the actual game pages
// (which have location/encounter data) rather than the HOME_X tracking games.
const HOME_SUBGROUP_GAME_GROUP = {
  HOME_KANTO:   'LGPE',
  HOME_GALAR:   'SwSh',
  HOME_IOA:     'SwSh',
  HOME_CT:      'SwSh',
  HOME_SINNOH:  'BDSP',
  HOME_HISUI:   'PLA',
  HOME_PALDEA:  'SV',
  HOME_KITA:    'SV',
  HOME_BB:      'SV',
  HOME_LUMIOSE: 'LZA',
  HOME_HYPER:   'LZA',
  HOME_MEGA:    'LZA',
};

// All primary (user-triggerable) scraper groups, in run order.
const SCRAPER_ALL_GROUPS = [
  'RBY','FRLG','LGPE',
  'GSC','HGSS',
  'RSE','ORAS',
  'DPPT','BDSP',
  'BW','BW2',
  'XY',
  'SM','USUM',
  'SwSh',
  'PLA',
  'SV',
  'LZA',
];

const VALID_SCRAPER_GROUPS = new Set([
  ...SCRAPER_ALL_GROUPS,
  'IoA','CT','Kita','BB',
]);

// Maps each sidebar display-group key to its scraper group keys.
const GROUP_SCRAPER_KEYS = {
  RBY: ['RBY'], GSC: ['GSC'], RSE: ['RSE'], FRLG: ['FRLG'],
  DPPT: ['DPPT'], HGSS: ['HGSS'], BW: ['BW'], BW2: ['BW2'],
  XY: ['XY'], ORAS: ['ORAS'], SM: ['SM'], USUM: ['USUM'],
  LGPE: ['LGPE'], BDSP: ['BDSP'],
  SwSh: ['SwSh', 'IoA', 'CT'],
  Legends: ['PLA'],
  LZA: ['LZA'],
  SV: ['SV', 'Kita', 'BB'],
};

// Sidebar scraper wheel SVG constants (R=8, circumference ≈ 50.27).
const SSW_R    = 8;
const SSW_CIRC = +(2 * Math.PI * SSW_R).toFixed(2);

module.exports = {
  TYPE_COLORS,
  REGIONS,
  GROUP_REGION,
  SHINY_DEX_FORM_EXCLUSIONS,
  GAME_LOGOS,
  GROUP_LABELS,
  GAME_ABBR,
  DISPLAY_GROUP,
  DLC_GROUPS,
  HOME_SHINY_DEXES,
  HOME_GAME_SUBGROUPS,
  HOME_GAME_SUBGROUP_LABELS,
  GAME_COLORS,
  EXCL_COLOR_DEFAULT,
  DLC_TABS,
  DLC_DEX_CONFIG,
  DLC_REGIONS,
  GROUP_DEX_KEY,
  REGION_PARENT_GROUP,
  REGION_VALID_DLCS,
  PAIRED_GAME_GROUPS,
  HOME_SUBGROUP_GAME_GROUP,
  SCRAPER_ALL_GROUPS,
  VALID_SCRAPER_GROUPS,
  GROUP_SCRAPER_KEYS,
  SSW_R,
  SSW_CIRC,
};
