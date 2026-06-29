'use strict';

// Maps each game group to the Bulbapedia game-specific location category (or categories).
// Use an array when a group spans multiple released titles with separate categories
// (e.g. RSE = Ruby/Sapphire + Emerald; DPPT = Diamond/Pearl + Platinum).
const GROUP_TO_CATEGORY = {
  RBY:  ['Red,_Blue_and_Yellow_locations'],
  GSC:  ['Gold,_Silver_and_Crystal_locations'],
  RSE:  ['Ruby_and_Sapphire_locations', 'Emerald_locations'],
  FRLG: ['FireRed_and_LeafGreen_locations'],
  DPPT: ['Diamond_and_Pearl_locations', 'Platinum_locations'],
  HGSS: ['HeartGold_and_SoulSilver_locations'],
  BW:   ['Black_and_White_locations'],
  BW2:  ['Black_2_and_White_2_locations'],
  XY:   ['X_and_Y_locations'],
  ORAS: ['Omega_Ruby_and_Alpha_Sapphire_locations'],
  SM:   ['Sun_and_Moon_locations'],
  USUM: ['Ultra_Sun_and_Ultra_Moon_locations'],
  LGPE: ["Let%27s_Go,_Pikachu!_and_Let%27s_Go,_Eevee!_locations"],
  SwSh: ['Sword_and_Shield_locations'],
  // IoA and CT are detected inline during the SwSh scrape via each location's infobox;
  // they no longer need separate category entries.
  BDSP: ['Brilliant_Diamond_and_Shining_Pearl_locations'],
  PLA:  ['Legends:_Arceus_locations'],
  LZA:  ['Legends:_Z-A_locations'],
  SV:   ['Scarlet_and_Violet_locations'],
  // Kita and BB are detected inline during the SV scrape via each location's infobox;
  // they no longer need separate entries.
};

// All DLC groups (IoA, CT, Kita, BB) are now detected inline during their base-game
// scrape. DLC_LOCATIONS is kept as an empty object for backwards compatibility.
const DLC_LOCATIONS = {};

module.exports = { GROUP_TO_CATEGORY, DLC_LOCATIONS };
