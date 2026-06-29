'use strict';

/**
 * seed-static-encounters.js
 *
 * Seeds all static, gift, roaming, fossil, and event-gated encounters that are
 * not captured by the Bulbapedia location-table scrapers.  Covers every mainline
 * game group from RBY through SV / Kita / BB.
 *
 * Run:
 *   DATABASE_URL=... node scripts/seed-static-encounters.js [--dry-run]
 *
 * Behaviour:
 *   • Creates any game_locations entries that are missing (e.g. Mt. Ember FRLG).
 *   • For every encounter defined below, DELETEs any existing row with the same
 *     (location_id, pokemon_id, game_id, encounter_method) before re-inserting,
 *     so stale records that lack conditions are cleanly replaced.
 *   • ON CONFLICT DO NOTHING protects against duplicates within a single run.
 *   • Rows in CLEANUP_WRONG are removed first to fix known bad seeder data.
 *
 * Condition keys used in the conditions JSONB:
 *   requires    – key item or party prerequisite (string or string[])
 *   event       – true if distribution / event-only
 *   event_item  – name of the event item needed
 *   roaming     – true; the location listed is the trigger / encounter point
 *   day         – day-of-week restriction (e.g. "Friday")
 *   postgame    – true if only available after the main story
 *   shiny       – true if the encounter is always Shiny
 *   disguised   – true if the Pokémon is disguised as an item on the field
 *   note        – free-text clarification
 */

const { Pool } = require('pg');
const megaStones = require('./seed-mega-stones');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const DRY_RUN = process.argv.includes('--dry-run');

// ─────────────────────────────────────────────────────────────────────────────
// NEW LOCATIONS
// Any location that doesn't yet exist in game_locations for its game_group.
// ─────────────────────────────────────────────────────────────────────────────
const NEW_LOCATIONS = [
  // Gen I — FireRed / LeafGreen
  { name: 'Mt. Ember',      group: 'FRLG', slug: 'Mt._Ember',      sort: 0 },
  { name: 'Navel Rock',     group: 'FRLG', slug: 'Navel_Rock',     sort: 0 },
  { name: 'Birth Island',   group: 'FRLG', slug: 'Birth_Island',   sort: 0 },
  // Gen III — RSE event locations
  { name: 'Navel Rock',     group: 'RSE',  slug: 'Navel_Rock',     sort: 0 },
  { name: 'Faraway Island', group: 'RSE',  slug: 'Faraway_Island', sort: 0 },
  // (Tin Tower removed — Suicune/Ho-Oh encounters are on the Bell Tower page)
  // Gen 9 — Legends: Z-A: Hyperspace Lumiose is the main nexus hub; the 11 named hyperspace
  // sub-zones (Hyperspace Desolate Land etc.) are scraped from their own category pages.
  // This entry covers the hub itself which hosts scan-based mythical encounters.
  { name: 'Hyperspace Lumiose', group: 'LZA', slug: 'Hyperspace_Lumiose', sort: 0 },
];

// ─────────────────────────────────────────────────────────────────────────────
// CLEANUP — remove known bad rows inserted by earlier scrapers
// Format: { location, group, pokemon_id, game, method }
// ─────────────────────────────────────────────────────────────────────────────
const CLEANUP_WRONG = [
  // ORAS: scraper incorrectly seeded Groudon in Alpha Sapphire and Kyogre in Omega Ruby
  { group: 'ORAS', location: 'Cave of Origin', pokemon_id: '383', game: 'Alpha Sapphire', method: 'special' },
  { group: 'ORAS', location: 'Cave of Origin', pokemon_id: '382', game: 'Omega Ruby',     method: 'special' },
  // ORAS: scraper also seeded a 'special' duplicate alongside the correct 'unique' hardcode
  { group: 'ORAS', location: 'Cave of Origin', pokemon_id: '383', game: 'Omega Ruby',     method: 'special' },
  { group: 'ORAS', location: 'Cave of Origin', pokemon_id: '382', game: 'Alpha Sapphire', method: 'special' },
  // RSE/ORAS: old seed used Route 119 as roaming trigger; replaced with correct locations
  { group: 'RSE',  location: 'Hoenn Route 119', pokemon_id: '380', game: 'Ruby',           method: 'wanderer' },
  { group: 'RSE',  location: 'Hoenn Route 119', pokemon_id: '381', game: 'Ruby',           method: 'wanderer' },
  { group: 'RSE',  location: 'Hoenn Route 119', pokemon_id: '380', game: 'Sapphire',       method: 'wanderer' },
  { group: 'RSE',  location: 'Hoenn Route 119', pokemon_id: '381', game: 'Sapphire',       method: 'wanderer' },
  { group: 'RSE',  location: 'Hoenn Route 119', pokemon_id: '380', game: 'Emerald',        method: 'wanderer' },
  { group: 'RSE',  location: 'Hoenn Route 119', pokemon_id: '381', game: 'Emerald',        method: 'wanderer' },
  { group: 'ORAS', location: 'Hoenn Route 119', pokemon_id: '380', game: 'Omega Ruby',     method: 'wanderer' },
  { group: 'ORAS', location: 'Hoenn Route 119', pokemon_id: '381', game: 'Alpha Sapphire', method: 'wanderer' },
  // DPPT/BDSP: Giratina blank-condition scraper duplicates (keep postgame entry)
  { group: 'DPPT', location: 'Turnback Cave', pokemon_id: '487', game: 'Diamond',          method: 'special' },
  { group: 'DPPT', location: 'Turnback Cave', pokemon_id: '487', game: 'Pearl',            method: 'special' },
  { group: 'DPPT', location: 'Turnback Cave', pokemon_id: '487', game: 'Platinum',         method: 'special' },
  { group: 'BDSP', location: 'Turnback Cave', pokemon_id: '487', game: 'Brilliant Diamond',method: 'special' },
  { group: 'BDSP', location: 'Turnback Cave', pokemon_id: '487', game: 'Shining Pearl',    method: 'special' },
  // BDSP: Dialga/Palkia scraper special duplicates (keep unique entries)
  { group: 'BDSP', location: 'Spear Pillar',  pokemon_id: '483', game: 'Brilliant Diamond',method: 'special' },
  { group: 'BDSP', location: 'Spear Pillar',  pokemon_id: '484', game: 'Shining Pearl',    method: 'special' },
  // BW: Keldeo at Moor of Icirrus — not a real in-game encounter in BW
  { group: 'BW',   location: 'Moor of Icirrus', pokemon_id: '647', game: 'Black',    method: 'special' },
  { group: 'BW',   location: 'Moor of Icirrus', pokemon_id: '647', game: 'White',    method: 'special' },
  // BW2: Keldeo at Abundant Shrine — requires existing event Keldeo, not a new encounter
  { group: 'BW2',  location: 'Abundant Shrine', pokemon_id: '647', game: 'Black 2',  method: 'special' },
  { group: 'BW2',  location: 'Abundant Shrine', pokemon_id: '647', game: 'White 2',  method: 'special' },
  // BW2: Azelf was incorrectly placed at Abundant Shrine; correct location is Route 23
  { group: 'BW2',  location: 'Abundant Shrine', pokemon_id: '482', game: 'Black 2',  method: 'special' },
  { group: 'BW2',  location: 'Abundant Shrine', pokemon_id: '482', game: 'White 2',  method: 'special' },
  // SwSh: Galarian birds moved to CT/IoA game groups; remove incorrect SwSh base entries
  { group: 'SwSh', location: 'Slumbering Weald',pokemon_id: '144_1',game: 'Sword',   method: 'wanderer' },
  { group: 'SwSh', location: 'Slumbering Weald',pokemon_id: '144_1',game: 'Shield',  method: 'wanderer' },
  { group: 'SwSh', location: 'Slumbering Weald',pokemon_id: '145_1',game: 'Sword',   method: 'wanderer' },
  { group: 'SwSh', location: 'Slumbering Weald',pokemon_id: '145_1',game: 'Shield',  method: 'wanderer' },
  { group: 'SwSh', location: 'Slumbering Weald',pokemon_id: '146_1',game: 'Sword',   method: 'wanderer' },
  { group: 'SwSh', location: 'Slumbering Weald',pokemon_id: '146_1',game: 'Shield',  method: 'wanderer' },
  // HGSS: Latias/Latios previously as wanderer at Kanto Route 10; replaced with static Pewter Museum
  { group: 'HGSS', location: 'Kanto Route 10',  pokemon_id: '380',  game: 'SoulSilver', method: 'wanderer' },
  { group: 'HGSS', location: 'Kanto Route 10',  pokemon_id: '381',  game: 'HeartGold',  method: 'wanderer' },
  // BW2: Reshiram/Zekrom wrong location (old seeder used Giant Chasm instead of Dragonspiral Tower)
  { group: 'BW2',  location: 'Giant Chasm',   pokemon_id: '643', game: 'Black 2',          method: 'unique' },
  { group: 'BW2',  location: 'Giant Chasm',   pokemon_id: '644', game: 'White 2',          method: 'unique' },
  // XY: scraper placed Xerneas/Yveltal at Pokémon Village; correct location is Team Flare Secret HQ
  { group: 'XY',   location: 'Pokémon Village', pokemon_id: '716', game: 'X', method: 'unique' },
  { group: 'XY',   location: 'Pokémon Village', pokemon_id: '717', game: 'Y', method: 'unique' },
  // USUM: wrong UB pokemon IDs and wrong Necrozma altar
  { group: 'USUM', location: 'Alola Route 17', pokemon_id: '804', game: 'Ultra Sun',        method: 'special' },
  { group: 'USUM', location: 'Alola Route 17', pokemon_id: '803', game: 'Ultra Moon',       method: 'special' },
  { group: 'USUM', location: 'Altar of the Sunne', pokemon_id: '800', game: 'Ultra Moon',   method: 'unique' },
  // DPPt: remove old blank-condition special entries we are replacing with richer ones
  { group: 'DPPT', location: 'Spear Pillar',    pokemon_id: '483', game: 'Diamond',   method: 'special' },
  { group: 'DPPT', location: 'Spear Pillar',    pokemon_id: '483', game: 'Pearl',     method: 'special' },
  { group: 'DPPT', location: 'Spear Pillar',    pokemon_id: '484', game: 'Diamond',   method: 'special' },
  { group: 'DPPT', location: 'Spear Pillar',    pokemon_id: '484', game: 'Pearl',     method: 'special' },
  { group: 'DPPT', location: 'Hallowed Tower',  pokemon_id: '442', game: 'Diamond',   method: 'unique' },
  { group: 'DPPT', location: 'Hallowed Tower',  pokemon_id: '442', game: 'Pearl',     method: 'unique' },
  { group: 'DPPT', location: 'Hallowed Tower',  pokemon_id: '442', game: 'Platinum',  method: 'unique' },
  { group: 'BDSP', location: 'Hallowed Tower',  pokemon_id: '442', game: 'Brilliant Diamond', method: 'unique' },
  { group: 'BDSP', location: 'Hallowed Tower',  pokemon_id: '442', game: 'Shining Pearl',     method: 'unique' },
  // GSC: Suicune was incorrectly seeded at Tin Tower; correct location is Bell Tower
  { group: 'GSC',  location: 'Tin Tower',        pokemon_id: '245', game: 'Crystal',           method: 'special' },
  // BB biome entries that were incorrectly added for DLC Paradox Pokémon (correct location is Area Zero, SV)
  { group: 'BB', location: 'Canyon Biome', pokemon_id: '1020', game: 'S - Blueberry', method: 'special' },
  { group: 'BB', location: 'Canyon Biome', pokemon_id: '1020', game: 'V - Blueberry', method: 'special' },
  { group: 'BB', location: 'Polar Biome',  pokemon_id: '1021', game: 'S - Blueberry', method: 'special' },
  { group: 'BB', location: 'Polar Biome',  pokemon_id: '1021', game: 'V - Blueberry', method: 'special' },
  { group: 'BB', location: 'Canyon Biome', pokemon_id: '1022', game: 'S - Blueberry', method: 'special' },
  { group: 'BB', location: 'Canyon Biome', pokemon_id: '1022', game: 'V - Blueberry', method: 'special' },
  { group: 'BB', location: 'Coastal Biome',pokemon_id: '1023', game: 'S - Blueberry', method: 'special' },
  { group: 'BB', location: 'Coastal Biome',pokemon_id: '1023', game: 'V - Blueberry', method: 'special' },
];

// ─────────────────────────────────────────────────────────────────────────────
// STATIC ENCOUNTERS
// ─────────────────────────────────────────────────────────────────────────────
// Fields:
//   group     – game_group
//   games     – 'all'  |  string[]  of game names within the group
//   pokemon   – pokedex.id  (base form, no _1 suffix unless intentional)
//   location  – game_locations.name  (exact match)
//   method    – encounter_method string
//   level     – number | [min, max] | null
//   conditions – object (optional; defaults to {})
//   skip      – if true, row is documented only and not inserted
// ─────────────────────────────────────────────────────────────────────────────
const ENCOUNTERS = [

  // ═══════════════════════════════════════════════════════════════════════════
  // GEN 1 — Red / Blue / Yellow
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Legendary birds & Mewtwo ──
  { group: 'RBY', games: 'all', pokemon: '144', location: 'Seafoam Islands',      method: 'special', level: 50 },
  { group: 'RBY', games: 'all', pokemon: '145', location: 'Kanto Power Plant',    method: 'special', level: 50 },
  { group: 'RBY', games: 'all', pokemon: '146', location: 'Victory Road (Kanto)', method: 'special', level: 50 },
  { group: 'RBY', games: 'all', pokemon: '150', location: 'Cerulean Cave',        method: 'special', level: 70, conditions: { postgame: true } },

  // ── Snorlax (two encounters — Route 12 and Route 16) ──
  { group: 'RBY', games: 'all', pokemon: '143', location: 'Kanto Route 12', method: 'special', level: 30, conditions: { requires: 'Poké Flute' } },
  { group: 'RBY', games: 'all', pokemon: '143', location: 'Kanto Route 16', method: 'special', level: 30, conditions: { requires: 'Poké Flute' } },


  // ═══════════════════════════════════════════════════════════════════════════
  // GEN 1 — FireRed / LeafGreen
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Legendary birds & Mewtwo ──
  { group: 'FRLG', games: 'all', pokemon: '144', location: 'Seafoam Islands',      method: 'special', level: 50 },
  { group: 'FRLG', games: 'all', pokemon: '145', location: 'Kanto Power Plant',    method: 'special', level: 50 },
  { group: 'FRLG', games: 'all', pokemon: '146', location: 'Mt. Ember',            method: 'special', level: 50 },
  { group: 'FRLG', games: 'all', pokemon: '150', location: 'Cerulean Cave',        method: 'special', level: 70, conditions: { postgame: true } },

  // ── Snorlax ──
  { group: 'FRLG', games: 'all', pokemon: '143', location: 'Kanto Route 12', method: 'special', level: 30, conditions: { requires: 'Poké Flute' } },
  { group: 'FRLG', games: 'all', pokemon: '143', location: 'Kanto Route 16', method: 'special', level: 30, conditions: { requires: 'Poké Flute' } },

  // ── Event-only ──
  { group: 'FRLG', games: 'all', pokemon: '386', location: 'Birth Island', method: 'special', level: 30, conditions: { event: true, event_item: 'Aurora Ticket' } },
  { group: 'FRLG', games: 'all', pokemon: '249', location: 'Navel Rock',   method: 'special', level: 70, conditions: { event: true, event_item: 'Mystic Ticket' } },
  { group: 'FRLG', games: 'all', pokemon: '250', location: 'Navel Rock',   method: 'special', level: 70, conditions: { event: true, event_item: 'Mystic Ticket' } },


  // ═══════════════════════════════════════════════════════════════════════════
  // GEN 1 — Let's Go, Pikachu! / Let's Go, Eevee!
  // (Legendary birds already captured by scraper as midair roamers; statics below
  //  are not in the LGPE parser — it does not call parseSpecialEncounters.)
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Mewtwo (post-game Cerulean Cave) ──
  { group: 'LGPE', games: 'all', pokemon: '150', location: 'Cerulean Cave', method: 'special', level: 70, conditions: { postgame: true } },

  // ── Snorlax (two blocking encounters — require Poké Flute from Pokémon Tower) ──
  { group: 'LGPE', games: 'all', pokemon: '143', location: 'Kanto Route 12', method: 'special', level: 30, conditions: { requires: 'Poké Flute' } },
  { group: 'LGPE', games: 'all', pokemon: '143', location: 'Kanto Route 16', method: 'special', level: 30, conditions: { requires: 'Poké Flute' } },


  // ═══════════════════════════════════════════════════════════════════════════
  // GEN 2 — Gold / Silver / Crystal
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Starters ──
  { group: 'GSC', games: 'all', pokemon: '152', location: 'New Bark Town', method: 'gift', level: 5 },
  { group: 'GSC', games: 'all', pokemon: '155', location: 'New Bark Town', method: 'gift', level: 5 },
  { group: 'GSC', games: 'all', pokemon: '158', location: 'New Bark Town', method: 'gift', level: 5 },

  // ── Gift Pokémon ──
  { group: 'GSC', games: 'all',       pokemon: '175', location: 'Johto Route 30', method: 'egg',  level: null },
  { group: 'GSC', games: 'all',       pokemon: '133', location: 'Goldenrod City', method: 'gift', level: 20 },
  { group: 'GSC', games: 'all',       pokemon: '236', location: 'Mt. Mortar',     method: 'gift', level: 10 },
  { group: 'GSC', games: 'all',       pokemon: '213', location: 'Cianwood City',  method: 'gift', level: 20, conditions: { note: 'Shuckie — must be returned later; NPC gives it back if traded back' } },
  { group: 'GSC', games: 'all',       pokemon: '22',  location: 'Johto Route 35', method: 'gift', level: 20, conditions: { note: 'Kenya the Spearow — traded for the Coin Case, returned if delivered to a man in Goldenrod City' } },
  { group: 'GSC', games: ['Crystal'], pokemon: '147', location: "Dragon's Den",   method: 'gift', level: 15 },

  // ── Static encounters ──
  { group: 'GSC', games: 'all', pokemon: '185', location: 'Johto Route 36',  method: 'special', level: 20, conditions: { requires: 'Squirt Bottle' } },
  { group: 'GSC', games: 'all', pokemon: '130', location: 'Lake of Rage',    method: 'unique',  level: 30, conditions: { shiny: true, note: 'Always Shiny Red Gyarados' } },
  { group: 'GSC', games: 'all', pokemon: '131', location: 'Union Cave',      method: 'special', level: 20, conditions: { day: 'Friday' } },
  { group: 'GSC', games: 'all', pokemon: '143', location: 'Kanto Route 11',  method: 'special', level: 50, conditions: { requires: 'Poké Flute channel on Pokégear' } },

  // ── Electrode (disguised as items in Team Rocket HQ) ──
  { group: 'GSC', games: 'all', pokemon: '101', location: 'Team Rocket HQ', method: 'special', level: 23, conditions: { disguised: true, note: 'Three Electrode disguised as items on B2F' } },

  // ── Legendary beasts (roam Johto after Burned Tower) ──
  { group: 'GSC', games: 'all',              pokemon: '243', location: 'Burned Tower', method: 'wanderer', level: 40, conditions: { roaming: true } },
  { group: 'GSC', games: 'all',              pokemon: '244', location: 'Burned Tower', method: 'wanderer', level: 40, conditions: { roaming: true } },
  { group: 'GSC', games: ['Gold', 'Silver'], pokemon: '245', location: 'Burned Tower', method: 'wanderer', level: 40, conditions: { roaming: true } },

  // ── Cover legendaries (primary — obtainable before Elite Four) ──
  { group: 'GSC', games: ['Gold'],    pokemon: '250', location: 'Bell Tower',    method: 'special', level: 40, conditions: { requires: 'Rainbow Wing' } },
  { group: 'GSC', games: ['Silver'],  pokemon: '249', location: 'Whirl Islands', method: 'special', level: 40, conditions: { requires: 'Silver Wing' } },
  { group: 'GSC', games: ['Crystal'], pokemon: '245', location: 'Bell Tower',    method: 'special', level: 40, conditions: { requires: 'Clear Bell', note: 'Static after chasing Suicune across Kanto/Johto; encounter is at the top of Bell Tower' } },
  // Crystal: both cover legendaries at lv60 — Ho-Oh needs Clear Bell (pre-E4), Lugia just needs navigation
  { group: 'GSC', games: ['Crystal'], pokemon: '250', location: 'Bell Tower',    method: 'special', level: 60 },
  { group: 'GSC', games: ['Crystal'], pokemon: '249', location: 'Whirl Islands', method: 'special', level: 60 },

  // ── Cross-version cover legendaries (post-game Kanto — wing from Pewter City elder) ──
  { group: 'GSC', games: ['Gold'],   pokemon: '249', location: 'Whirl Islands', method: 'special', level: 70, conditions: { requires: 'Silver Wing',  postgame: true, note: 'Silver Wing from Pewter City elder in post-game Kanto' } },
  { group: 'GSC', games: ['Silver'], pokemon: '250', location: 'Bell Tower',    method: 'special', level: 70, conditions: { requires: 'Rainbow Wing', postgame: true, note: 'Rainbow Wing from Pewter City elder in post-game Kanto' } },

  // ── Celebi — Crystal event (GS Ball, Japan only) ──
  { group: 'GSC', games: ['Crystal'], pokemon: '251', location: 'Ilex Forest', method: 'special', level: 30, conditions: { event: true, event_item: 'GS Ball', note: 'Never distributed outside Japan via Mobile System GB' } },


  // ═══════════════════════════════════════════════════════════════════════════
  // GEN 2 — HeartGold / SoulSilver  (legendaries not covered by parser)
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Cover legendaries (primary — before Elite Four) ──
  { group: 'HGSS', games: ['HeartGold'], pokemon: '250', location: 'Bell Tower',    method: 'special', level: 45, conditions: { requires: 'Rainbow Wing' } },
  { group: 'HGSS', games: ['SoulSilver'],pokemon: '249', location: 'Whirl Islands', method: 'special', level: 45, conditions: { requires: 'Silver Wing' } },

  // ── Cross-version cover legendaries (post-game Kanto — wing from Pewter City elder) ──
  { group: 'HGSS', games: ['HeartGold'], pokemon: '249', location: 'Whirl Islands', method: 'special', level: 70, conditions: { requires: 'Silver Wing',  postgame: true, note: 'Silver Wing from Pewter City elder in post-game Kanto' } },
  { group: 'HGSS', games: ['SoulSilver'],pokemon: '250', location: 'Bell Tower',    method: 'special', level: 70, conditions: { requires: 'Rainbow Wing', postgame: true, note: 'Rainbow Wing from Pewter City elder in post-game Kanto' } },

  // ── Legendary birds (Kanto post-game) ──
  { group: 'HGSS', games: 'all', pokemon: '144', location: 'Seafoam Islands',   method: 'special', level: 50, conditions: { postgame: true } },
  { group: 'HGSS', games: 'all', pokemon: '145', location: 'Kanto Power Plant', method: 'special', level: 50, conditions: { postgame: true } },
  { group: 'HGSS', games: 'all', pokemon: '146', location: 'Mt. Silver',        method: 'special', level: 50, conditions: { postgame: true } },

  // ── Legendary beasts (roam Johto after Burned Tower) ──
  { group: 'HGSS', games: 'all', pokemon: '243', location: 'Burned Tower', method: 'wanderer', level: 40, conditions: { roaming: true } },
  { group: 'HGSS', games: 'all', pokemon: '244', location: 'Burned Tower', method: 'wanderer', level: 40, conditions: { roaming: true } },
  { group: 'HGSS', games: 'all', pokemon: '245', location: 'Burned Tower', method: 'wanderer', level: 40, conditions: { roaming: true } },

  // ── Lati@s via Enigma Stone event (static encounter at Pewter Museum, not roaming) ──
  { group: 'HGSS', games: ['HeartGold'], pokemon: '381', location: 'Pewter Museum of Science', method: 'special', level: 35, conditions: { event: true, event_item: 'Enigma Stone', postgame: true } },
  { group: 'HGSS', games: ['SoulSilver'],pokemon: '380', location: 'Pewter Museum of Science', method: 'special', level: 35, conditions: { event: true, event_item: 'Enigma Stone', postgame: true } },

  // ── Red Gyarados + Snorlax ──
  { group: 'HGSS', games: 'all', pokemon: '130', location: 'Lake of Rage',    method: 'unique',  level: 30, conditions: { shiny: true, note: 'Always Shiny Red Gyarados' } },
  { group: 'HGSS', games: 'all', pokemon: '143', location: 'Kanto Route 11', method: 'special', level: 50, conditions: { requires: 'Poké Flute channel on Pokégear' } },

  // ── Embedded Tower (post-game — orb from Mr. Pokemon triggers the encounter) ──
  { group: 'HGSS', games: ['HeartGold'],  pokemon: '382', location: 'Embedded Tower', method: 'special', level: 45, conditions: { requires: 'Blue Orb',  postgame: true } },
  { group: 'HGSS', games: ['SoulSilver'], pokemon: '383', location: 'Embedded Tower', method: 'special', level: 45, conditions: { requires: 'Red Orb',   postgame: true } },
  { group: 'HGSS', games: 'all',          pokemon: '384', location: 'Embedded Tower', method: 'special', level: 50, conditions: { requires: 'Jade Orb', postgame: true, note: 'Available after catching both Kyogre and Groudon; Jade Orb from Professor Oak' } },


  // ═══════════════════════════════════════════════════════════════════════════
  // GEN 3 — Ruby / Sapphire / Emerald
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Cover legendaries ──
  { group: 'RSE', games: ['Ruby'],    pokemon: '383', location: 'Cave of Origin', method: 'unique',  level: 45 },
  { group: 'RSE', games: ['Sapphire'],pokemon: '382', location: 'Cave of Origin', method: 'unique',  level: 45 },
  { group: 'RSE', games: ['Ruby', 'Sapphire'], pokemon: '384', location: 'Sky Pillar', method: 'special', level: 70, conditions: { postgame: true } },
  { group: 'RSE', games: ['Emerald'],          pokemon: '384', location: 'Sky Pillar', method: 'unique',  level: 70, conditions: { note: 'Mandatory story catch — must be caught to stop the Kyogre/Groudon conflict' } },

  // ── Regi trio ──
  { group: 'RSE', games: 'all', pokemon: '377', location: 'Desert Ruins', method: 'special', level: 40, conditions: { requires: ['Relicanth and Wailord in party', 'Braille puzzle solved'] } },
  { group: 'RSE', games: 'all', pokemon: '378', location: 'Island Cave',  method: 'special', level: 40, conditions: { requires: ['Relicanth and Wailord in party', 'Braille puzzle solved'] } },
  { group: 'RSE', games: 'all', pokemon: '379', location: 'Ancient Tomb', method: 'special', level: 40, conditions: { requires: ['Relicanth and Wailord in party', 'Braille puzzle solved'] } },

  // ── Lati@s (roaming — trigger is TV broadcast at home in Littleroot Town post-E4) ──
  // The roamer appears anywhere in Hoenn; Littleroot Town is the broadcast trigger point.
  { group: 'RSE', games: ['Ruby'],     pokemon: '381', location: 'Littleroot Town', method: 'wanderer', level: 40, conditions: { roaming: true, postgame: true, note: 'Roams all Hoenn routes after TV broadcast in player\'s house' } },
  { group: 'RSE', games: ['Sapphire'], pokemon: '380', location: 'Littleroot Town', method: 'wanderer', level: 40, conditions: { roaming: true, postgame: true, note: 'Roams all Hoenn routes after TV broadcast in player\'s house' } },
  { group: 'RSE', games: ['Ruby'],     pokemon: '380', location: 'Southern Island',  method: 'special',  level: 50, conditions: { event: true, event_item: 'Eon Ticket' } },
  { group: 'RSE', games: ['Sapphire'], pokemon: '381', location: 'Southern Island',  method: 'special',  level: 50, conditions: { event: true, event_item: 'Eon Ticket' } },
  { group: 'RSE', games: ['Emerald'],  pokemon: '380', location: 'Littleroot Town', method: 'wanderer', level: 40, conditions: { roaming: true, postgame: true, note: 'Player chooses Latias or Latios after TV broadcast; the unchosen one roams all Hoenn routes' } },
  { group: 'RSE', games: ['Emerald'],  pokemon: '381', location: 'Littleroot Town', method: 'wanderer', level: 40, conditions: { roaming: true, postgame: true, note: 'Player chooses Latias or Latios after TV broadcast; the unchosen one roams all Hoenn routes' } },

  // ── Groudon / Kyogre in Emerald (Terra Cave / Marine Cave — shift daily to random routes) ──
  { group: 'RSE', games: ['Emerald'], pokemon: '383', location: 'Terra Cave',  method: 'special', level: 70, conditions: { postgame: true, note: 'Terra Cave appears at a random Hoenn route each day; Groudon is inside at Lv. 70' } },
  { group: 'RSE', games: ['Emerald'], pokemon: '382', location: 'Marine Cave', method: 'special', level: 70, conditions: { postgame: true, note: 'Marine Cave appears at a random Hoenn route each day; Kyogre is inside at Lv. 70' } },

  // ── Gift: Castform ──
  { group: 'RSE', games: 'all', pokemon: '351', location: 'Hoenn Route 119', method: 'gift', level: 25, conditions: { note: 'Given by Weather Institute researcher after defeating Team Aqua/Magma' } },

  // ── Static: Kecleon (requires Devon Scope) ──
  { group: 'RSE', games: 'all', pokemon: '352', location: 'Hoenn Route 119', method: 'special', level: 30, conditions: { requires: 'Devon Scope', note: 'Up to 8 encounters across Routes 119–120' } },
  { group: 'RSE', games: 'all', pokemon: '352', location: 'Hoenn Route 120', method: 'special', level: 30, conditions: { requires: 'Devon Scope' } },

  // ── Static: Voltorb / Electrode (disguised items in New Mauville — all three games) ──
  { group: 'RSE', games: 'all', pokemon: '100', location: 'New Mauville', method: 'special', level: 25, conditions: { disguised: true } },
  { group: 'RSE', games: 'all', pokemon: '101', location: 'New Mauville', method: 'special', level: 25, conditions: { disguised: true } },

  // ── Sudowoodo (Emerald only, Battle Frontier entrance) ──
  { group: 'RSE', games: ['Emerald'], pokemon: '185', location: 'Battle Frontier (Generation III)', method: 'special', level: 40, conditions: { postgame: true } },

  // ── Emerald event legendaries ──
  { group: 'RSE', games: ['Emerald'], pokemon: '249', location: 'Navel Rock',     method: 'special', level: 70, conditions: { event: true, event_item: 'Mystic Ticket' } },
  { group: 'RSE', games: ['Emerald'], pokemon: '250', location: 'Navel Rock',     method: 'special', level: 70, conditions: { event: true, event_item: 'Mystic Ticket' } },
  { group: 'RSE', games: ['Emerald'], pokemon: '151', location: 'Faraway Island', method: 'special', level: 30, conditions: { event: true, event_item: 'Old Sea Map', note: 'Japan/Taiwan distribution only' } },
  { group: 'RSE', games: ['Emerald'], pokemon: '386', location: 'Birth Island',   method: 'special', level: 30, conditions: { event: true, event_item: 'Aurora Ticket', note: 'Japan distribution only; Speed Forme' } },


  // ═══════════════════════════════════════════════════════════════════════════
  // GEN 3 — Omega Ruby / Alpha Sapphire
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Cover legendaries (version-exclusive; replaces incorrect scraped data) ──
  { group: 'ORAS', games: ['Omega Ruby'],     pokemon: '383', location: 'Cave of Origin', method: 'unique', level: 45 },
  { group: 'ORAS', games: ['Alpha Sapphire'], pokemon: '382', location: 'Cave of Origin', method: 'unique', level: 45 },

  // ── Delta Episode: Rayquaza (mandatory) and Deoxys ──
  { group: 'ORAS', games: 'all', pokemon: '384', location: 'Sky Pillar', method: 'unique',  level: 70, conditions: { postgame: true, note: 'Delta Episode — must be caught to continue story' } },
  { group: 'ORAS', games: 'all', pokemon: '386', location: 'Sky Pillar', method: 'special', level: 80, conditions: { postgame: true, note: 'Accessible after completing the Delta Episode' } },

  // ── Regi trio + Regigigas ──
  { group: 'ORAS', games: 'all', pokemon: '377', location: 'Desert Ruins', method: 'special', level: 40, conditions: { postgame: true } },
  { group: 'ORAS', games: 'all', pokemon: '378', location: 'Island Cave',  method: 'special', level: 40, conditions: { postgame: true } },
  { group: 'ORAS', games: 'all', pokemon: '379', location: 'Ancient Tomb', method: 'special', level: 40, conditions: { postgame: true } },
  { group: 'ORAS', games: 'all', pokemon: '486', location: 'Island Cave',  method: 'special', level: 1,  conditions: { postgame: true, requires: 'Regirock + Regice + Registeel in party' } },

  // ── Lati@s (Southern Island story gift + roaming opposite) ──
  { group: 'ORAS', games: ['Omega Ruby'],     pokemon: '381', location: 'Southern Island',  method: 'gift',    level: 30 },  // Latios — story gift in OR
  { group: 'ORAS', games: ['Alpha Sapphire'], pokemon: '380', location: 'Southern Island',  method: 'gift',    level: 30 },  // Latias — story gift in AS
  // The opposite Lati is encountered via Eon Flute soaring; trigger is completing the story at Southern Island
  { group: 'ORAS', games: ['Omega Ruby'],     pokemon: '380', location: 'Southern Island', method: 'wanderer', level: 40, conditions: { roaming: true, postgame: true, note: 'Latias roams Hoenn via Eon Flute soaring after Latios is caught on Southern Island' } },
  { group: 'ORAS', games: ['Alpha Sapphire'], pokemon: '381', location: 'Southern Island', method: 'wanderer', level: 40, conditions: { roaming: true, postgame: true, note: 'Latios roams Hoenn via Eon Flute soaring after Latias is caught on Southern Island' } },

  // ── Post-game static legendaries ──
  { group: 'ORAS', games: 'all', pokemon: '485', location: 'Scorched Slab', method: 'special', level: 50, conditions: { postgame: true } },


  // ═══════════════════════════════════════════════════════════════════════════
  // GEN 4 — Diamond / Pearl / Platinum
  // (Replaces blank-condition records from parseSpecialEncounters)
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Spear Pillar — story-mandatory ──
  { group: 'DPPT', games: ['Diamond', 'Platinum'], pokemon: '483', location: 'Spear Pillar', method: 'unique', level: 47 },
  { group: 'DPPT', games: ['Pearl',   'Platinum'], pokemon: '484', location: 'Spear Pillar', method: 'unique', level: 47 },

  // ── Post-game legendaries ──
  { group: 'DPPT', games: 'all', pokemon: '487', location: 'Turnback Cave',    method: 'special', level: 70, conditions: { postgame: true } },
  { group: 'DPPT', games: 'all', pokemon: '485', location: 'Stark Mountain',   method: 'special', level: 70, conditions: { postgame: true } },
  { group: 'DPPT', games: 'all', pokemon: '486', location: 'Snowpoint Temple', method: 'special', level: 1,  conditions: { postgame: true, requires: 'Regirock + Regice + Registeel transferred from Gen III in party' } },

  // ── Lake trio ──
  { group: 'DPPT', games: 'all',                pokemon: '480', location: 'Lake Acuity', method: 'special',  level: 50 },
  { group: 'DPPT', games: 'all',                pokemon: '482', location: 'Lake Valor',  method: 'special',  level: 50 },
  { group: 'DPPT', games: ['Diamond', 'Pearl'], pokemon: '481', location: 'Lake Verity', method: 'wanderer', level: 50, conditions: { roaming: true, note: 'Roams Sinnoh after being encountered at Lake Verity' } },
  { group: 'DPPT', games: ['Platinum'],          pokemon: '481', location: 'Lake Verity', method: 'special',  level: 50 },

  // ── Cresselia ──
  { group: 'DPPT', games: ['Diamond', 'Pearl'], pokemon: '488', location: 'Fullmoon Island', method: 'wanderer', level: 50, conditions: { roaming: true, postgame: true } },
  { group: 'DPPT', games: ['Platinum'],          pokemon: '488', location: 'Fullmoon Island', method: 'special',  level: 50, conditions: { postgame: true } },

  // ── Special statics with timing / item conditions ──
  { group: 'DPPT', games: 'all', pokemon: '425', location: 'Valley Windworks', method: 'special', level: 22, conditions: { day: 'Friday', note: 'Only on Fridays after Team Galactic is defeated at the Windworks' } },
  { group: 'DPPT', games: 'all', pokemon: '479', location: 'Old Chateau',      method: 'special', level: 15, conditions: { note: 'Night only — interact with TV in room 3; accessible from Badge 3 onwards' } },

  // ── Spiritomb ──
  { group: 'DPPT', games: 'all', pokemon: '442', location: 'Hallowed Tower', method: 'special', level: 25, conditions: { requires: ['Odd Keystone', '32 Underground NPC interactions'] } },

  // ── Roaming legendary birds (Platinum only, post-National Dex) ──
  { group: 'DPPT', games: ['Platinum'], pokemon: '144', location: 'Sinnoh Route 201', method: 'wanderer', level: 60, conditions: { roaming: true, postgame: true, requires: 'National Pokédex', note: 'Roams entire Sinnoh region' } },
  { group: 'DPPT', games: ['Platinum'], pokemon: '145', location: 'Sinnoh Route 201', method: 'wanderer', level: 60, conditions: { roaming: true, postgame: true, requires: 'National Pokédex', note: 'Roams entire Sinnoh region' } },
  { group: 'DPPT', games: ['Platinum'], pokemon: '146', location: 'Sinnoh Route 201', method: 'wanderer', level: 60, conditions: { roaming: true, postgame: true, requires: 'National Pokédex', note: 'Roams entire Sinnoh region' } },

  // ── Event legendaries ──
  { group: 'DPPT', games: 'all', pokemon: '491', location: 'Newmoon Island',  method: 'special', level: 40, conditions: { event: true, event_item: 'Member Card' } },
  { group: 'DPPT', games: 'all', pokemon: '492', location: 'Flower Paradise', method: 'special', level: 30, conditions: { event: true, event_item: "Oak's Letter" } },
  { group: 'DPPT', games: 'all', pokemon: '493', location: 'Spear Pillar',    method: 'special', level: 80, conditions: { event: true, event_item: 'Azure Flute', note: 'Azure Flute was never officially distributed' } },


  // ═══════════════════════════════════════════════════════════════════════════
  // GEN 4 — Brilliant Diamond / Shining Pearl
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Spear Pillar ──
  { group: 'BDSP', games: ['Brilliant Diamond'], pokemon: '483', location: 'Spear Pillar', method: 'unique', level: 47 },
  { group: 'BDSP', games: ['Shining Pearl'],     pokemon: '484', location: 'Spear Pillar', method: 'unique', level: 47 },

  // ── Post-game legendaries ──
  { group: 'BDSP', games: 'all', pokemon: '487', location: 'Turnback Cave',    method: 'special', level: 70, conditions: { postgame: true } },
  { group: 'BDSP', games: 'all', pokemon: '485', location: 'Stark Mountain',   method: 'special', level: 70, conditions: { postgame: true } },
  { group: 'BDSP', games: 'all', pokemon: '486', location: 'Snowpoint Temple', method: 'special', level: 1,  conditions: { postgame: true, requires: 'Regirock + Regice + Registeel via Mystery Gift or transfer' } },

  // ── Lake trio + Cresselia ──
  { group: 'BDSP', games: 'all',                   pokemon: '480', location: 'Lake Acuity',    method: 'special',  level: 50 },
  { group: 'BDSP', games: 'all',                   pokemon: '482', location: 'Lake Valor',     method: 'special',  level: 50 },
  { group: 'BDSP', games: 'all',                   pokemon: '481', location: 'Lake Verity',    method: 'wanderer', level: 50, conditions: { roaming: true } },
  { group: 'BDSP', games: 'all',                   pokemon: '488', location: 'Fullmoon Island',method: 'wanderer', level: 50, conditions: { roaming: true, postgame: true } },

  // ── Special statics ──
  { group: 'BDSP', games: 'all', pokemon: '425', location: 'Valley Windworks', method: 'special', level: 22, conditions: { day: 'Friday' } },
  { group: 'BDSP', games: 'all', pokemon: '479', location: 'Old Chateau',      method: 'special', level: 15, conditions: { note: 'Night only — interact with TV in room 3' } },
  { group: 'BDSP', games: 'all', pokemon: '442', location: 'Hallowed Tower',   method: 'special', level: 25, conditions: { requires: ['Odd Keystone', '32 Underground NPC interactions'] } },

  // ── Event legendaries ──
  { group: 'BDSP', games: 'all', pokemon: '491', location: 'Newmoon Island',  method: 'special', level: 40, conditions: { event: true, event_item: 'Member Card' } },
  { group: 'BDSP', games: 'all', pokemon: '492', location: 'Flower Paradise', method: 'special', level: 30, conditions: { event: true, event_item: "Oak's Letter" } },


  // ═══════════════════════════════════════════════════════════════════════════
  // GEN 5 — Black / White
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Swords of Justice (static encounters) ──
  { group: 'BW', games: 'all', pokemon: '638', location: 'Mistralton Cave',              method: 'special', level: 42 },
  { group: 'BW', games: 'all', pokemon: '639', location: 'Victory Road (Black and White)',method: 'special', level: 42 },
  { group: 'BW', games: 'all', pokemon: '640', location: 'Pinwheel Forest',              method: 'special', level: 42 },
  // Keldeo is event-only in BW — no in-game encounter exists (form-change mechanic is BW2-only)

  // ── Roaming Forces of Nature ──
  { group: 'BW', games: ['Black'], pokemon: '641', location: 'Unova Route 7', method: 'wanderer', level: 40, conditions: { roaming: true, note: 'Roams Unova in stormy weather' } },
  { group: 'BW', games: ['White'], pokemon: '642', location: 'Unova Route 7', method: 'wanderer', level: 40, conditions: { roaming: true, note: 'Roams Unova in thunderstorm weather' } },

  // ── Landorus (Abundant Shrine — requires both Tornadus and Thundurus) ──
  { group: 'BW', games: 'all', pokemon: '645', location: 'Abundant Shrine', method: 'special', level: 70, conditions: { requires: 'Tornadus (Black) or Thundurus (White) + trade partner; both needed' } },

  // ── Kyurem ──
  { group: 'BW', games: 'all', pokemon: '646', location: 'Giant Chasm', method: 'special', level: 75, conditions: { postgame: true } },

  // ── Volcarona (Relic Castle) ──
  { group: 'BW', games: 'all', pokemon: '637', location: 'Relic Castle', method: 'special', level: 70 },

  // ── Musharna (Dreamyard — Fridays only) ──
  { group: 'BW', games: 'all', pokemon: '518', location: 'Dreamyard', method: 'special', level: 50, conditions: { day: 'Friday', note: 'Appears on Fridays only in the Dreamyard basement' } },

  // ── Darmanitan statues (Desert Resort — Rage Candy Bar) ──
  { group: 'BW', games: 'all', pokemon: '555', location: 'Desert Resort', method: 'special', level: 35, conditions: { requires: 'Rage Candy Bar', note: '5 Zen Mode statues awakened by using Rage Candy Bar' } },

  // ── Victini (Liberty Garden — event Liberty Pass) ──
  { group: 'BW', games: 'all', pokemon: '494', location: 'Liberty Garden', method: 'special', level: 15, conditions: { event: true, event_item: 'Liberty Pass' } },

  // ── Reshiram / Zekrom — Dragonspiral Tower (fallback if not caught at N's Castle) ──
  { group: 'BW', games: ['Black'], pokemon: '643', location: 'Dragonspiral Tower', method: 'special', level: 50, conditions: { postgame: true, note: 'Respawn location if Reshiram was not caught at N\'s Castle; re-appears after entering the Hall of Fame' } },
  { group: 'BW', games: ['White'], pokemon: '644', location: 'Dragonspiral Tower', method: 'special', level: 50, conditions: { postgame: true, note: 'Respawn location if Zekrom was not caught at N\'s Castle; re-appears after entering the Hall of Fame' } },


  // ═══════════════════════════════════════════════════════════════════════════
  // GEN 5 — Black 2 / White 2
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Swords of Justice (static encounters at fixed locations — NOT roaming) ──
  { group: 'BW2', games: 'all', pokemon: '638', location: 'Unova Route 13', method: 'special', level: 45, conditions: { postgame: true } },
  { group: 'BW2', games: 'all', pokemon: '639', location: 'Unova Route 22', method: 'special', level: 45, conditions: { postgame: true } },
  { group: 'BW2', games: 'all', pokemon: '640', location: 'Unova Route 11', method: 'special', level: 45, conditions: { postgame: true } },
  // Keldeo: event-only, not a catchable static encounter in BW2 (Moor of Icirrus mechanic only changes its form)

  // ── Regi trio + Regigigas ──
  { group: 'BW2', games: 'all',          pokemon: '377', location: 'Underground Ruins', method: 'special', level: 65, conditions: { postgame: true } },
  { group: 'BW2', games: ['White 2'],    pokemon: '378', location: 'Underground Ruins', method: 'special', level: 65, conditions: { postgame: true, requires: 'Iceberg Key' } },
  { group: 'BW2', games: ['Black 2'],    pokemon: '379', location: 'Underground Ruins', method: 'special', level: 65, conditions: { postgame: true, requires: 'Iron Key' } },
  { group: 'BW2', games: 'all',          pokemon: '486', location: 'Twist Mountain',    method: 'special', level: 68, conditions: { postgame: true, requires: 'Regirock + Regice + Registeel in party' } },

  // ── Lake trio ──
  { group: 'BW2', games: 'all', pokemon: '480', location: 'Nacrene City',     method: 'special', level: 65, conditions: { postgame: true } },
  { group: 'BW2', games: 'all', pokemon: '481', location: 'Celestial Tower',  method: 'special', level: 65, conditions: { postgame: true } },
  { group: 'BW2', games: 'all', pokemon: '482', location: 'Unova Route 23',   method: 'special', level: 65, conditions: { postgame: true } },

  // ── Heatran + Cresselia ──
  { group: 'BW2', games: 'all', pokemon: '485', location: 'Reversal Mountain', method: 'special', level: 68, conditions: { postgame: true, requires: 'Magma Stone' } },
  { group: 'BW2', games: 'all', pokemon: '488', location: 'Marvelous Bridge',  method: 'special', level: 68, conditions: { postgame: true, requires: 'Lunar Wing' } },

  // ── Kyurem ──
  { group: 'BW2', games: 'all', pokemon: '646', location: 'Giant Chasm', method: 'special', level: 70, conditions: { postgame: true } },

  // ── Reshiram / Zekrom (post-game at Dragonspiral Tower) ──
  // Both legendaries are catchable in both versions:
  //   Black 2: catches Reshiram (its version legendary) + N's Zekrom (freed from Black Kyurem)
  //   White 2: catches Zekrom (its version legendary) + N's Reshiram (freed from White Kyurem)
  { group: 'BW2', games: ['Black 2'], pokemon: '643', location: 'Dragonspiral Tower', method: 'unique',  level: 70 },
  { group: 'BW2', games: ['White 2'], pokemon: '644', location: 'Dragonspiral Tower', method: 'unique',  level: 70 },
  { group: 'BW2', games: ['White 2'], pokemon: '643', location: 'Dragonspiral Tower', method: 'special', level: 70, conditions: { postgame: true, requires: 'Light Stone in bag', note: "N's Reshiram — freed from White Kyurem after the story" } },
  { group: 'BW2', games: ['Black 2'], pokemon: '644', location: 'Dragonspiral Tower', method: 'special', level: 70, conditions: { postgame: true, requires: 'Dark Stone in bag',  note: "N's Zekrom — freed from Black Kyurem after the story" } },

  // ── Roaming Lati@s ──
  { group: 'BW2', games: ['Black 2'], pokemon: '381', location: 'Dreamyard', method: 'wanderer', level: 68, conditions: { roaming: true, postgame: true } },
  { group: 'BW2', games: ['White 2'], pokemon: '380', location: 'Dreamyard', method: 'wanderer', level: 68, conditions: { roaming: true, postgame: true } },

  // ── Volcarona ──
  { group: 'BW2', games: 'all', pokemon: '637', location: 'Relic Castle', method: 'special', level: 35, conditions: { postgame: true, note: 'Level 65 post-game; initial encounter is Level 35' } },


  // ═══════════════════════════════════════════════════════════════════════════
  // GEN 6 — X / Y
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Cover legendaries (story-mandatory — version-exclusive; scraper placed these at wrong location) ──
  { group: 'XY', games: ['X'], pokemon: '716', location: 'Team Flare Secret HQ', method: 'unique', level: 50 },
  { group: 'XY', games: ['Y'], pokemon: '717', location: 'Team Flare Secret HQ', method: 'unique', level: 50 },

  // ── Post-game statics ──
  { group: 'XY', games: 'all', pokemon: '150', location: 'Unknown Dungeon (Kalos)', method: 'special', level: 70, conditions: { postgame: true } },
  { group: 'XY', games: 'all', pokemon: '718', location: 'Terminus Cave',   method: 'special', level: 70, conditions: { postgame: true } },

  // ── Roaming legendary birds → Sea Spirit's Den (starter-dependent) ──
  { group: 'XY', games: 'all', pokemon: '144', location: "Sea Spirit's Den", method: 'special', level: 70, conditions: { postgame: true, requires: 'Chose Chespin as starter', note: 'Roams Kalos 10× before appearing at Sea Spirit\'s Den' } },
  { group: 'XY', games: 'all', pokemon: '145', location: "Sea Spirit's Den", method: 'special', level: 70, conditions: { postgame: true, requires: 'Chose Fennekin as starter', note: 'Roams Kalos 10× before appearing at Sea Spirit\'s Den' } },
  { group: 'XY', games: 'all', pokemon: '146', location: "Sea Spirit's Den", method: 'special', level: 70, conditions: { postgame: true, requires: 'Chose Froakie as starter',  note: 'Roams Kalos 10× before appearing at Sea Spirit\'s Den' } },


  // ═══════════════════════════════════════════════════════════════════════════
  // GEN 7 — Sun / Moon
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Guardian deities (Tapus) ──
  { group: 'SM', games: 'all', pokemon: '785', location: 'Ruins of Conflict',  method: 'special', level: 60, conditions: { postgame: true } },
  { group: 'SM', games: 'all', pokemon: '786', location: 'Ruins of Life',      method: 'special', level: 60, conditions: { postgame: true } },
  { group: 'SM', games: 'all', pokemon: '787', location: 'Ruins of Abundance', method: 'special', level: 60, conditions: { postgame: true } },
  { group: 'SM', games: 'all', pokemon: '788', location: 'Ruins of Hope',      method: 'special', level: 60, conditions: { postgame: true } },

  // ── Necrozma ──
  { group: 'SM', games: 'all', pokemon: '800', location: 'Ten Carat Hill', method: 'special', level: 75, conditions: { postgame: true, note: 'Farthest Hollow area' } },

  // ── Ultra Beasts (post-game, after story) ──
  { group: 'SM', games: 'all',        pokemon: '793', location: 'Diglett\'s Tunnel', method: 'special', level: 55, conditions: { postgame: true, note: 'UB-01 Symbiont — two locations; also Wela Volcano Park' } },
  { group: 'SM', games: ['Sun'],      pokemon: '794', location: 'Melemele Meadow',   method: 'special', level: 65, conditions: { postgame: true, note: 'UB-02 Absorption' } },
  { group: 'SM', games: ['Moon'],     pokemon: '795', location: 'Verdant Cavern',    method: 'special', level: 60, conditions: { postgame: true, note: 'UB-02 Beauty' } },
  { group: 'SM', games: 'all',        pokemon: '796', location: 'Lush Jungle',       method: 'special', level: 65, conditions: { postgame: true, note: 'UB-03 Lighting — also Memorial Hill' } },
  { group: 'SM', games: ['Moon'],     pokemon: '797', location: 'Haina Desert',      method: 'special', level: 65, conditions: { postgame: true, note: 'UB-04 Blaster — also Malie Garden' } },
  { group: 'SM', games: ['Sun'],      pokemon: '798', location: 'Alola Route 17',    method: 'special', level: 60, conditions: { postgame: true, note: 'UB-04 Blade — also Malie Garden' } },
  { group: 'SM', games: 'all',        pokemon: '799', location: 'Resolution Cave',   method: 'special', level: 70, conditions: { postgame: true, note: 'UB-05 Glutton' } },


  // ═══════════════════════════════════════════════════════════════════════════
  // GEN 7 — Ultra Sun / Ultra Moon
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Guardian deities ──
  { group: 'USUM', games: 'all', pokemon: '785', location: 'Ruins of Conflict',  method: 'special', level: 60, conditions: { postgame: true } },
  { group: 'USUM', games: 'all', pokemon: '786', location: 'Ruins of Life',      method: 'special', level: 60, conditions: { postgame: true } },
  { group: 'USUM', games: 'all', pokemon: '787', location: 'Ruins of Abundance', method: 'special', level: 60, conditions: { postgame: true } },
  { group: 'USUM', games: 'all', pokemon: '788', location: 'Ruins of Hope',      method: 'special', level: 60, conditions: { postgame: true } },

  // ── Ultra Beasts ──
  { group: 'USUM', games: 'all',             pokemon: '793', location: 'Diglett\'s Tunnel', method: 'special', level: 55, conditions: { postgame: true } },
  { group: 'USUM', games: ['Ultra Sun'],     pokemon: '794', location: 'Melemele Meadow',   method: 'special', level: 65, conditions: { postgame: true } },
  { group: 'USUM', games: ['Ultra Moon'],    pokemon: '795', location: 'Verdant Cavern',    method: 'special', level: 60, conditions: { postgame: true } },
  { group: 'USUM', games: 'all',             pokemon: '796', location: 'Lush Jungle',       method: 'special', level: 65, conditions: { postgame: true } },
  { group: 'USUM', games: ['Ultra Moon'],    pokemon: '797', location: 'Haina Desert',      method: 'special', level: 65, conditions: { postgame: true } },
  { group: 'USUM', games: ['Ultra Sun'],     pokemon: '798', location: 'Alola Route 17',    method: 'special', level: 60, conditions: { postgame: true } },
  { group: 'USUM', games: 'all',             pokemon: '799', location: 'Resolution Cave',   method: 'special', level: 70, conditions: { postgame: true } },
  // ── USUM-exclusive Ultra Beasts (correct IDs: 805=Stakataka, 806=Blacephalon) ──
  { group: 'USUM', games: ['Ultra Sun'],  pokemon: '806', location: 'Alola Route 17', method: 'special', level: 65, conditions: { postgame: true, note: 'UB Burst (Blacephalon)' } },
  { group: 'USUM', games: ['Ultra Moon'], pokemon: '805', location: 'Alola Route 17', method: 'special', level: 65, conditions: { postgame: true, note: 'UB Assembly (Stakataka)' } },

  // ── Necrozma (story capture — version-split altars) ──
  { group: 'USUM', games: ['Ultra Sun'],  pokemon: '800', location: 'Altar of the Sunne', method: 'unique', level: 75, conditions: { note: 'Dusk Mane Necrozma fused with Solgaleo' } },
  { group: 'USUM', games: ['Ultra Moon'], pokemon: '800', location: 'Altar of the Moone', method: 'unique', level: 75, conditions: { note: 'Dawn Wings Necrozma fused with Lunala' } },


  // ═══════════════════════════════════════════════════════════════════════════
  // GEN 8 — Sword / Shield  (Galarian Birds — not yet seeded)
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Galarian Legendary Birds — seeded in CT/IoA game groups (not base SwSh) ──
  // Galarian Articuno: roams Crown Tundra in both Sword and Shield (Frostpoint Field area)
  { group: 'CT', games: ['SW - Crown Tundra', 'SH - Crown Tundra'], pokemon: '144_1', location: 'Frostpoint Field', method: 'wanderer', level: 70, conditions: { roaming: true, note: 'Roams Frostpoint Field, Giant\'s Bed, Old Cemetery, Snowslide Slope' } },
  // Galarian Zapdos: Sword roams Wild Area (CT DLC unlock); Shield roams Crown Tundra
  { group: 'CT', games: ['SW - Crown Tundra', 'SH - Crown Tundra'], pokemon: '145_1', location: "Giant's Bed", method: 'wanderer', level: 70, conditions: { roaming: true, note: 'Sword: runs in Wild Area (CT DLC required); Shield: runs in Crown Tundra' } },
  // Galarian Moltres: Sword roams Crown Tundra; Shield roams Isle of Armor
  { group: 'CT',  games: ['SW - Crown Tundra'], pokemon: '146_1', location: "Giant's Bed",      method: 'wanderer', level: 70, conditions: { roaming: true, note: 'Sword: runs in Crown Tundra (Giant\'s Bed area)' } },
  { group: 'IoA', games: ['SH - Isle of Armor'], pokemon: '146_1', location: 'Honeycalm Island', method: 'wanderer', level: 70, conditions: { roaming: true, note: 'Shield: runs around Isle of Armor' } },

  // ── Zarude (event only) ──
  { group: 'SwSh', games: 'all', pokemon: '893', location: 'Slumbering Weald', method: 'gift', level: 60, conditions: { event: true, note: 'Mystery Gift distribution — event has ended' } },


  // ═══════════════════════════════════════════════════════════════════════════
  // GEN 9 — Scarlet / Violet  (Treasures of Ruin, Ogerpon, Terapagos)
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Treasures of Ruin (unlock each shrine by pulling 8 matching stakes) ──
  { group: 'SV', games: 'all', pokemon: '1001', location: 'South Province (Area One)', method: 'special', level: 60, conditions: { requires: '8 yellow stakes (Wo-Chien shrine)' } },
  { group: 'SV', games: 'all', pokemon: '1002', location: 'West Province (Area One)',  method: 'special', level: 60, conditions: { requires: '8 red stakes (Chien-Pao shrine)' } },
  { group: 'SV', games: 'all', pokemon: '1003', location: 'Socarrat Trail',            method: 'special', level: 60, conditions: { requires: '8 blue stakes (Ting-Lu shrine)' } },
  { group: 'SV', games: 'all', pokemon: '1004', location: 'North Province (Area Two)', method: 'special', level: 60, conditions: { requires: '8 purple stakes (Chi-Yu shrine)' } },

  // ── Second box legendary (post-game — after completing Indigo Disk DLC) ──
  // Professor Turo/Sada returns to Area Zero and lets you catch the partner legend.
  { group: 'SV', games: ['Scarlet'], pokemon: '1008', location: 'Area Zero', method: 'special', level: 72, conditions: { postgame: true, requires: 'Complete the Indigo Disk DLC story', note: 'Miraidon — Scarlet players catch it post-Indigo Disk' } },
  { group: 'SV', games: ['Violet'],  pokemon: '1007', location: 'Area Zero', method: 'special', level: 72, conditions: { postgame: true, requires: 'Complete the Indigo Disk DLC story', note: 'Koraidon — Violet players catch it post-Indigo Disk' } },

  // ── Snacksworth treats (Indigo Disk DLC) ──
  // After completing enough 5★/6★ Tera Raid Battles at Blueberry Academy,
  // Snacksworth gives one-time treat items. Using a treat at a specific spot in
  // Paldea spawns that legendary as a permanent overworld encounter.
  // These are NOT Tera Raid events — they are fixed static encounters.
  // All available in both Scarlet and Violet. Level 70.
  { group: 'SV', games: 'all', pokemon: '144', location: 'Glaseado Mountain',        method: 'special', level: 70, conditions: { postgame: true, requires: 'Articuno Treat from Snacksworth' } },
  { group: 'SV', games: 'all', pokemon: '145', location: 'Tagtree Thicket',           method: 'special', level: 70, conditions: { postgame: true, requires: 'Zapdos Treat from Snacksworth' } },
  { group: 'SV', games: 'all', pokemon: '146', location: 'West Province (Area Two)',  method: 'special', level: 70, conditions: { postgame: true, requires: 'Moltres Treat from Snacksworth', note: 'Near Zapapico' } },
  { group: 'SV', games: 'all', pokemon: '243', location: 'Casseroya Lake',            method: 'special', level: 70, conditions: { postgame: true, requires: 'Raikou Treat from Snacksworth' } },
  { group: 'SV', games: 'all', pokemon: '244', location: 'East Province (Area Three)',method: 'special', level: 70, conditions: { postgame: true, requires: 'Entei Treat from Snacksworth' } },
  { group: 'SV', games: 'all', pokemon: '245', location: 'Glaseado Mountain',         method: 'special', level: 70, conditions: { postgame: true, requires: 'Suicune Treat from Snacksworth' } },
  { group: 'SV', games: 'all', pokemon: '249', location: 'Casseroya Lake',            method: 'special', level: 70, conditions: { postgame: true, requires: 'Lugia Treat from Snacksworth' } },
  { group: 'SV', games: 'all', pokemon: '250', location: 'North Province (Area Three)',method: 'special', level: 70, conditions: { postgame: true, requires: 'Ho-Oh Treat from Snacksworth' } },
  { group: 'SV', games: 'all', pokemon: '377', location: 'Asado Desert',              method: 'special', level: 70, conditions: { postgame: true, requires: 'Regirock Treat from Snacksworth' } },
  { group: 'SV', games: 'all', pokemon: '378', location: 'Glaseado Mountain',         method: 'special', level: 70, conditions: { postgame: true, requires: 'Regice Treat from Snacksworth' } },
  { group: 'SV', games: 'all', pokemon: '379', location: 'South Province (Area Five)',method: 'special', level: 70, conditions: { postgame: true, requires: 'Registeel Treat from Snacksworth' } },
  { group: 'SV', games: 'all', pokemon: '380', location: 'South Province (Area Six)', method: 'special', level: 70, conditions: { postgame: true, requires: 'Latias Treat from Snacksworth' } },
  { group: 'SV', games: 'all', pokemon: '381', location: 'West Province (Area Three)',method: 'special', level: 70, conditions: { postgame: true, requires: 'Latios Treat from Snacksworth' } },
  { group: 'SV', games: 'all', pokemon: '382', location: 'Casseroya Lake',            method: 'special', level: 70, conditions: { postgame: true, requires: 'Kyogre Treat from Snacksworth' } },
  { group: 'SV', games: 'all', pokemon: '383', location: 'Asado Desert',              method: 'special', level: 70, conditions: { postgame: true, requires: 'Groudon Treat from Snacksworth' } },
  { group: 'SV', games: 'all', pokemon: '384', location: 'Great Crater of Paldea',   method: 'special', level: 70, conditions: { postgame: true, requires: 'Rayquaza Treat from Snacksworth', note: 'Only one available' } },
  { group: 'SV', games: 'all', pokemon: '480', location: 'Casseroya Lake',            method: 'special', level: 70, conditions: { postgame: true, requires: 'Uxie Treat from Snacksworth' } },
  { group: 'SV', games: 'all', pokemon: '481', location: 'North Province (Area Three)',method: 'special', level: 70, conditions: { postgame: true, requires: 'Mesprit Treat from Snacksworth' } },
  { group: 'SV', games: 'all', pokemon: '482', location: 'Casseroya Lake',            method: 'special', level: 70, conditions: { postgame: true, requires: 'Azelf Treat from Snacksworth' } },
  { group: 'SV', games: 'all', pokemon: '483', location: 'Great Crater of Paldea',   method: 'special', level: 70, conditions: { postgame: true, requires: 'Dialga Treat from Snacksworth' } },
  { group: 'SV', games: 'all', pokemon: '484', location: 'Great Crater of Paldea',   method: 'special', level: 70, conditions: { postgame: true, requires: 'Palkia Treat from Snacksworth' } },
  { group: 'SV', games: 'all', pokemon: '487', location: 'Great Crater of Paldea',   method: 'special', level: 70, conditions: { postgame: true, requires: 'Giratina Treat from Snacksworth' } },
  { group: 'SV', games: 'all', pokemon: '488', location: 'Dalizapa Passage',          method: 'special', level: 70, conditions: { postgame: true, requires: 'Cresselia Treat from Snacksworth' } },
  { group: 'SV', games: 'all', pokemon: '638', location: 'Casseroya Lake',            method: 'special', level: 70, conditions: { postgame: true, requires: 'Cobalion Treat from Snacksworth' } },
  { group: 'SV', games: 'all', pokemon: '639', location: 'East Province (Area Three)',method: 'special', level: 70, conditions: { postgame: true, requires: 'Terrakion Treat from Snacksworth' } },
  { group: 'SV', games: 'all', pokemon: '640', location: 'West Province (Area Two)',  method: 'special', level: 70, conditions: { postgame: true, requires: 'Virizion Treat from Snacksworth' } },
  { group: 'SV', games: 'all', pokemon: '641', location: 'West Province (Area Three)',method: 'special', level: 70, conditions: { postgame: true, requires: 'Tornadus Treat from Snacksworth' } },
  { group: 'SV', games: 'all', pokemon: '642', location: 'East Province (Area One)',  method: 'special', level: 70, conditions: { postgame: true, requires: 'Thundurus Treat from Snacksworth' } },
  { group: 'SV', games: 'all', pokemon: '643', location: 'North Province (Area One)', method: 'special', level: 70, conditions: { postgame: true, requires: 'Reshiram Treat from Snacksworth' } },
  { group: 'SV', games: 'all', pokemon: '644', location: 'North Province (Area One)', method: 'special', level: 70, conditions: { postgame: true, requires: 'Zekrom Treat from Snacksworth' } },
  { group: 'SV', games: 'all', pokemon: '645', location: 'Asado Desert',              method: 'special', level: 70, conditions: { postgame: true, requires: 'Landorus Treat from Snacksworth (requires Tornadus and Thundurus registered in Pokédex)' } },
  { group: 'SV', games: 'all', pokemon: '646', location: 'Glaseado Mountain',         method: 'special', level: 70, conditions: { postgame: true, requires: 'Kyurem Treat from Snacksworth' } },
  { group: 'SV', games: 'all', pokemon: '716', location: 'West Province (Area Two)',  method: 'special', level: 70, conditions: { postgame: true, requires: 'Xerneas Treat from Snacksworth' } },
  { group: 'SV', games: 'all', pokemon: '717', location: 'South Province (Area Five)',method: 'special', level: 70, conditions: { postgame: true, requires: 'Yveltal Treat from Snacksworth' } },
  { group: 'SV', games: 'all', pokemon: '791', location: 'Great Crater of Paldea',   method: 'special', level: 70, conditions: { postgame: true, requires: 'Solgaleo Treat from Snacksworth' } },
  { group: 'SV', games: 'all', pokemon: '792', location: 'Great Crater of Paldea',   method: 'special', level: 70, conditions: { postgame: true, requires: 'Lunala Treat from Snacksworth' } },

  // ── Indigo Disk DLC Paradox Pokémon — unlock in Area Zero (Perrin's questline) ──
  { group: 'SV', games: ['Scarlet'], pokemon: '1020', location: 'Area Zero', method: 'special', level: 55, conditions: { postgame: true, requires: "Start Perrin's questline in The Indigo Disk DLC", note: 'Ancient Paradox form of Entei; only one per save' } },
  { group: 'SV', games: ['Scarlet'], pokemon: '1021', location: 'Area Zero', method: 'special', level: 55, conditions: { postgame: true, requires: "Start Perrin's questline in The Indigo Disk DLC", note: 'Ancient Paradox form of Raikou; only one per save' } },
  { group: 'SV', games: ['Violet'],  pokemon: '1022', location: 'Area Zero', method: 'special', level: 55, conditions: { postgame: true, requires: "Start Perrin's questline in The Indigo Disk DLC", note: 'Future Paradox form of Terrakion; only one per save' } },
  { group: 'SV', games: ['Violet'],  pokemon: '1023', location: 'Area Zero', method: 'special', level: 55, conditions: { postgame: true, requires: "Start Perrin's questline in The Indigo Disk DLC", note: 'Future Paradox form of Cobalion; only one per save' } },

  // ═══════════════════════════════════════════════════════════════════════════
  // GEN 9 — Teal Mask DLC  (S - Kitakami / V - Kitakami)
  // ═══════════════════════════════════════════════════════════════════════════

  // ── The Loyal Three (unlock via story; Ogerpon is story mandatory) ──
  { group: 'Kita', games: 'all', pokemon: '1014', location: 'Kitakami', method: 'special', level: 60, conditions: { postgame: true } },
  { group: 'Kita', games: 'all', pokemon: '1015', location: 'Kitakami', method: 'special', level: 60, conditions: { postgame: true } },
  { group: 'Kita', games: 'all', pokemon: '1016', location: 'Kitakami', method: 'special', level: 60, conditions: { postgame: true } },

  // ── Ogerpon (story mandatory catch) ──
  { group: 'Kita', games: 'all', pokemon: '1017', location: 'Kitakami', method: 'unique', level: 70, conditions: { note: 'Teal Mask story mandatory; form depends on which mask is used' } },

  // ── Bloodmoon Ursaluna ──
  { group: 'Kita', games: 'all', pokemon: '901_1', location: 'Timeless Woods', method: 'special', level: 70, conditions: { postgame: true, note: 'Bloodmoon Form; exclusive to Teal Mask DLC' } },

  // ── Pecharunt (Mochi Mayhem event — requires completed Teal Mask) ──
  { group: 'Kita', games: 'all', pokemon: '1025', location: 'Kitakami Hall', method: 'special', level: 88, conditions: { event: true, note: 'Mochi Mayhem — unlock requires completing Teal Mask story and receiving an event trigger via Mystery Gift' } },

  // ═══════════════════════════════════════════════════════════════════════════
  // GEN 9 — Indigo Disk DLC  (S - Blueberry / V - Blueberry)
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Terapagos (story mandatory) ──
  { group: 'BB', games: 'all', pokemon: '1024', location: 'Blueberry Academy', method: 'unique', level: 68, conditions: { note: 'Indigo Disk story; obtained in Terastal Form then Stellar Form activates in battle' } },

  // ── BBQ treat-unlock legendaries ──
  // Fixed overworld spawns in each biome, unlocked by spending BP at the BBQ exchange.
  // The scraper misses these because Bulbapedia lists them in a separate unlock section.
  // NOTE: The legendary beasts (Raikou/Entei/Suicune) and Swords of Justice are NOT
  // here — they are Snacksworth treat encounters in Paldea (see SV section below).

  // Canyon Biome
  { group: 'BB', games: 'all', pokemon: '787',  location: 'Canyon Biome',  method: 'special', level: 72, conditions: { postgame: true, requires: 'Unlock Tapu Bulu habitat via BBQ exchange (spend BP)' } },

  // Coastal Biome
  { group: 'BB', games: 'all', pokemon: '785',  location: 'Coastal Biome', method: 'special', level: 72, conditions: { postgame: true, requires: 'Unlock Tapu Koko habitat via BBQ exchange (spend BP)' } },
  { group: 'BB', games: 'all', pokemon: '647',  location: 'Coastal Biome', method: 'special', level: 72, conditions: { postgame: true, requires: 'Cobalion + Terrakion + Virizion in party (obtain via Snacksworth treats in Paldea)', note: 'Keldeo — appears after all three Swords of Justice are registered' } },

  // Polar Biome
  { group: 'BB', games: 'all', pokemon: '788',  location: 'Polar Biome',   method: 'special', level: 72, conditions: { postgame: true, requires: 'Unlock Tapu Fini habitat via BBQ exchange (spend BP)' } },

  // Savanna Biome
  { group: 'BB', games: 'all', pokemon: '786',  location: 'Savanna Biome', method: 'special', level: 72, conditions: { postgame: true, requires: 'Unlock Tapu Lele habitat via BBQ exchange (spend BP)' } },
  { group: 'BB', games: 'all', pokemon: '648',  location: 'Savanna Biome', method: 'special', level: 72, conditions: { postgame: true, requires: 'Complete the Savanna Biome concert at the stage (bring Pokémon with the required moves)', note: 'Meloetta — Normal/Psychic form' } },


  // ═══════════════════════════════════════════════════════════════════════════
  // GEN 8 — Legends: Arceus
  // (The PLA parser covers wild/alpha/special encounters from Bulbapedia tables
  //  but legendary statics are not on the standard location pages.)
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Cover legends (story choice — Dialga if sided with Adaman, Palkia if with Irida;
  //    the unchosen one is caught in the post-game; both are catchable in every save) ──
  { group: 'PLA', games: 'all', pokemon: '483', location: 'Temple of Sinnoh', method: 'unique', level: 65, conditions: { note: 'Story choice with Adaman/Irida determines which form; both are catchable in the same save post-game' } },
  { group: 'PLA', games: 'all', pokemon: '484', location: 'Temple of Sinnoh', method: 'unique', level: 65, conditions: { note: 'Story choice with Adaman/Irida determines which form; both are catchable in the same save post-game' } },

  // ── Lake guardians + lake trial Pokémon ──
  // Each lake has a story-mission trial encounter followed by a post-game guardian catch.
  { group: 'PLA', games: 'all', pokemon: '571_1', location: 'Lake Acuity', method: 'special', level: 58, conditions: { note: 'Alpha Hisuian Zoroark — Mission 16: The Trial of Lake Acuity; does not respawn if defeated' } },
  { group: 'PLA', games: 'all', pokemon: '480',   location: 'Lake Acuity', method: 'special', level: 65, conditions: { postgame: true, note: 'Mission 21: The Plate of the Lakes; respawns immediately if fled or knocked out' } },
  { group: 'PLA', games: 'all', pokemon: '904',   location: 'Lake Valor',  method: 'special', level: 58, conditions: { note: 'Alpha Overqwil — Mission 15: The Trial of Lake Valor; does not respawn if defeated' } },
  { group: 'PLA', games: 'all', pokemon: '482',   location: 'Lake Valor',  method: 'special', level: 65, conditions: { postgame: true, note: 'Mission 21: The Plate of the Lakes; respawns immediately if fled or knocked out' } },
  { group: 'PLA', games: 'all', pokemon: '706_1', location: 'Lake Verity', method: 'special', level: 58, conditions: { note: 'Alpha Hisuian Goodra — Mission 14: The Trial of Lake Verity; does not respawn if defeated' } },
  { group: 'PLA', games: 'all', pokemon: '481',   location: 'Lake Verity', method: 'special', level: 65, conditions: { postgame: true, note: 'Mission 21: The Plate of the Lakes; respawns immediately if fled or knocked out' } },

  // ── Giratina (post-game — Turnback Cave, Coronet Highlands) ──
  { group: 'PLA', games: 'all', pokemon: '487', location: 'Turnback Cave', method: 'special', level: 70, conditions: { postgame: true } },

  // ── Forces of Nature (post-game — triggered by specific weather in specific areas) ──
  { group: 'PLA', games: 'all', pokemon: '641', location: 'Bonechill Wastes',  method: 'special', level: 70, conditions: { postgame: true, note: 'Tornadus — appears during blizzard in Alabaster Icelands' } },
  { group: 'PLA', games: 'all', pokemon: '642', location: 'Cobalt Coastlands', method: 'special', level: 70, conditions: { postgame: true, note: 'Thundurus — appears during thunderstorm in Cobalt Coastlands' } },
  { group: 'PLA', games: 'all', pokemon: '645', location: 'Ramanas Island',    method: 'special', level: 70, conditions: { postgame: true, requires: 'Tornadus and Thundurus caught', note: 'Landorus — Obsidian Fieldlands' } },
  { group: 'PLA', games: 'all', pokemon: '905', location: 'Scarlet Bog',       method: 'special', level: 70, conditions: { postgame: true, requires: 'Tornadus, Thundurus, and Landorus caught', note: 'Enamorus — Crimson Mirelands' } },

  // ── Arceus (requires completing all 242 Pokédex entries) ──
  { group: 'PLA', games: 'all', pokemon: '493', location: 'Hall of Origin', method: 'special', level: 75, conditions: { postgame: true, requires: 'Complete all 242 Pokédex entries', note: 'Azure Flute obtained from Professor Laventon upon completing the Pokédex; different from the DPPt event item' } },

  // ── Snowpoint Temple ──
  { group: 'PLA', games: 'all', pokemon: '628_1', location: 'Snowpoint Temple', method: 'special', level: 54, conditions: { note: 'Hisuian Braviary — Mission 12: The Slumbering Lord of the Tundra; story catch, becomes ride Pokémon; respawns if fled or knocked out' } },
  { group: 'PLA', games: 'all', pokemon: '486',   location: 'Snowpoint Temple', method: 'special', level: 70, conditions: { postgame: true, note: 'Regigigas — Mission 24: The Plate of Snowpoint Temple; respawns if fled or knocked out; never Shiny' } },

  // ── Save-data bonuses ──
  { group: 'PLA', games: 'all', pokemon: '492', location: 'Floaro Gardens',     method: 'special', level: 70, conditions: { postgame: true, requires: 'Sword or Shield save data on the same console', note: 'Shaymin — Land Forme' } },
  { group: 'PLA', games: 'all', pokemon: '491', location: 'Clamberclaw Cliffs', method: 'special', level: 70, conditions: { postgame: true, requires: 'Brilliant Diamond or Shining Pearl save data on the same console', note: 'Darkrai' } },


  // ═══════════════════════════════════════════════════════════════════════════
  // GEN 9 — Legends: Z-A  (base game + Mega Dimension DLC v2.0.0+)
  //
  // The lza.js parser scrapes wild encounter tables from Bulbapedia location
  // pages. This section covers everything that scraper cannot reach:
  //   • Story-mandatory catches (Xerneas, Yveltal, Zygarde)
  //   • Base-game sidequest gifts (Kalos starters, Kanto starters, fossils, etc.)
  //   • Mega Dimension DLC legendaries/mythicals gated behind missions or items
  //
  // Location names match the Bulbapedia page titles that seed-encounters.js
  // would create in game_locations for the LZA game_group.
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Story-mandatory catches (main missions, base game) ──
  // Xerneas — Jaune District, Wild Zone 11; Main Mission 40: The One That Gives
  { group: 'LZA', games: 'all', pokemon: '716', location: 'Wild Zone 11',  method: 'unique', level: null },
  // Yveltal — Rouge District, Rouge Sector 2; Main Mission 41: The One That Takes
  { group: 'LZA', games: 'all', pokemon: '717', location: 'Rouge Sector 2', method: 'unique', level: null },
  // Zygarde — Centrico Plaza, Wild Zone 20; Main Mission 42: To Keep the World in Balance
  { group: 'LZA', games: 'all', pokemon: '718', location: 'Wild Zone 20',  method: 'special', level: null },

  // ── Base-game sidequest gifts ──
  // Kalos starters — one per mission, gifted by NPCs in Lumiose City
  { group: 'LZA', games: 'all', pokemon: '650', location: 'Lumiose City', method: 'gift', level: null, conditions: { requires: 'Side Mission 007: A Feisty Chespin' } },
  { group: 'LZA', games: 'all', pokemon: '653', location: 'Lumiose City', method: 'gift', level: null, conditions: { requires: 'Side Mission 008: Get Well, Fennekin' } },
  { group: 'LZA', games: 'all', pokemon: '656', location: 'Lumiose City', method: 'gift', level: null, conditions: { requires: 'Side Mission 009: A Challenge from Froakie' } },
  // Spewpa (Marine Pattern) — gifted during museum-related sidequest
  { group: 'LZA', games: 'all', pokemon: '665', location: 'Lumiose City', method: 'gift', level: null, conditions: { requires: 'Side Mission 021: Spewpa in the Museum', note: 'Marine Pattern — specific to this mission' } },
  // Kanto starters — choice of one from Mable
  { group: 'LZA', games: 'all', pokemon: '1', location: 'Lumiose City', method: 'gift', level: null, conditions: { requires: 'Side Mission 022: A Call from Mable', note: 'Choice of Bulbasaur, Charmander, or Squirtle' } },
  { group: 'LZA', games: 'all', pokemon: '4', location: 'Lumiose City', method: 'gift', level: null, conditions: { requires: 'Side Mission 022: A Call from Mable', note: 'Choice of Bulbasaur, Charmander, or Squirtle' } },
  { group: 'LZA', games: 'all', pokemon: '7', location: 'Lumiose City', method: 'gift', level: null, conditions: { requires: 'Side Mission 022: A Call from Mable', note: 'Choice of Bulbasaur, Charmander, or Squirtle' } },
  // Fossil Pokémon — choice of one revived at the Research Lab
  { group: 'LZA', games: 'all', pokemon: '696', location: 'Pokémon Research Lab (Kalos)', method: 'gift', level: null, conditions: { requires: 'Side Mission 027: Restored from a Fossil', note: 'Choice of Tyrunt or Amaura' } },
  { group: 'LZA', games: 'all', pokemon: '698', location: 'Pokémon Research Lab (Kalos)', method: 'gift', level: null, conditions: { requires: 'Side Mission 027: Restored from a Fossil', note: 'Choice of Tyrunt or Amaura' } },

  // ── Mega Dimension DLC — Hyperspace Snacksworth legendaries ──
  // Completing Hyperspace Missions 12–14 awards Snacksworth treats that unlock
  // one-time encounters in their respective named hyperspace zones.
  { group: 'LZA', games: 'all', pokemon: '383', location: 'Hyperspace Desolate Land',  method: 'special', level: null, conditions: { postgame: true, requires: 'Groudon Treat from Snacksworth — complete Hyperspace Mission 13: A Ruby-Red Legend' } },
  { group: 'LZA', games: 'all', pokemon: '382', location: 'Hyperspace Primordial Sea', method: 'special', level: null, conditions: { postgame: true, requires: 'Kyogre Treat from Snacksworth — complete Hyperspace Mission 14: A Sapphire-Blue Legend' } },
  { group: 'LZA', games: 'all', pokemon: '384', location: 'Hyperspace Sky Pillar',     method: 'special', level: null, conditions: { postgame: true, requires: 'Complete Hyperspace Mission 12: The Greatest Gift; catch Groudon and Kyogre first' } },

  // ── Mega Dimension DLC — boss encounters in named hyperspace arenas ──
  { group: 'LZA', games: 'all', pokemon: '485', location: 'Hyperspace Infernal Arena',    method: 'special', level: null, conditions: { postgame: true, note: 'Rogue Mega Heatran — Mega Dimension DLC mid-boss; awards Heatranite on defeat' } },
  // Darkrai is the Mega Dimension DLC final boss; trapped in hyperspace after Mega Evolution
  // exposure atop Prism Tower overwhelmed its nightmare abilities.
  { group: 'LZA', games: 'all', pokemon: '491', location: 'Hyperspace Newmoon Nightmare', method: 'unique',  level: null, conditions: { postgame: true, note: 'Mega Dimension DLC final boss' } },

  // ── Mega Dimension DLC — Hyperspace Lumiose special scan encounters ──
  // Performing a special scan inside Hyperspace Lumiose triggers a one-time
  // encounter with each of the following; exact scan location varies per Pokémon.
  { group: 'LZA', games: 'all', pokemon: '380', location: 'Hyperspace Lumiose', method: 'special', level: null, conditions: { postgame: true, requires: 'Special scan in Hyperspace Lumiose (Mega Dimension DLC)' } },
  { group: 'LZA', games: 'all', pokemon: '381', location: 'Hyperspace Lumiose', method: 'special', level: null, conditions: { postgame: true, requires: 'Special scan in Hyperspace Lumiose (Mega Dimension DLC)' } },
  { group: 'LZA', games: 'all', pokemon: '638', location: 'Hyperspace Lumiose', method: 'special', level: null, conditions: { postgame: true, requires: 'Special scan in Hyperspace Lumiose (Mega Dimension DLC)' } },
  { group: 'LZA', games: 'all', pokemon: '639', location: 'Hyperspace Lumiose', method: 'special', level: null, conditions: { postgame: true, requires: 'Special scan in Hyperspace Lumiose (Mega Dimension DLC)' } },
  { group: 'LZA', games: 'all', pokemon: '640', location: 'Hyperspace Lumiose', method: 'special', level: null, conditions: { postgame: true, requires: 'Special scan in Hyperspace Lumiose (Mega Dimension DLC)' } },
  { group: 'LZA', games: 'all', pokemon: '647', location: 'Hyperspace Lumiose', method: 'special', level: null, conditions: { postgame: true, requires: 'Special scan in Hyperspace Lumiose (Mega Dimension DLC)' } },
  { group: 'LZA', games: 'all', pokemon: '648', location: 'Hyperspace Lumiose', method: 'special', level: null, conditions: { postgame: true, requires: 'Special scan in Hyperspace Lumiose (Mega Dimension DLC)' } },

  // ── Mega Dimension DLC — numbered sidequest encounters/gifts ──
  { group: 'LZA', games: 'all', pokemon: '649', location: 'Hyperspace Lumiose',          method: 'special', level: null, conditions: { postgame: true, requires: 'Side Mission 191: Collect Four Drives' } },
  { group: 'LZA', games: 'all', pokemon: '802', location: 'Rouge Sector 1',              method: 'special', level: null, conditions: { postgame: true, requires: 'Side Mission 192: The Stealthy Shadow' } },
  { group: 'LZA', games: 'all', pokemon: '808', location: 'Rouge Sector 1',              method: 'gift',    level: null, conditions: { postgame: true, requires: 'Side Mission 193: Dreams of Meltan' } },
  { group: 'LZA', games: 'all', pokemon: '721', location: 'Pokémon Research Lab (Kalos)', method: 'special', level: null, conditions: { postgame: true, requires: 'Side Mission 194: Volcanion Unleashed' } },
  { group: 'LZA', games: 'all', pokemon: '801', location: 'Quasartico Inc. (building)',  method: 'gift',    level: null, conditions: { postgame: true, requires: 'Side Mission 195: Restarting Magearna' } },
  // Hoopa — Prison Bottle is also awarded by this mission; required to access Hoopa Unbound form.
  { group: 'LZA', games: 'all', pokemon: '720', location: 'Hyperspace Lumiose',          method: 'special', level: null, conditions: { postgame: true, requires: 'Side Mission 196: The Djinn Unbound; Prison Bottle (also rewarded by this mission) needed to change to Hoopa Unbound form' } },

  // ── Zeraora — Mystery Gift event distribution ──
  { group: 'LZA', games: 'all', pokemon: '807', location: 'Hyperspace Lumiose', method: 'gift', level: null, conditions: { event: true, note: 'Mystery Gift activation required in Hyperspace Lumiose' } },

  // ── Mega Stones — obtained by defeating Rogue Mega Pokémon in main story missions ──
  // Encounters are on the Mega form pokemon_id so that clicking a Mega form card in
  // the Mega Evolution dex shows stone acquisition info rather than wild locations.
  { group: 'LZA', games: 'all', pokemon: '80_1',  location: 'Battle zone (Lumiose City)', method: 'mega-stone', level: null, conditions: { requires: 'Main Mission 11: A Rogue Mega Slowbro',     note: 'Defeat Rogue Mega Slowbro to receive Slowbronite' } },
  { group: 'LZA', games: 'all', pokemon: '323_1', location: 'Battle zone (Lumiose City)', method: 'mega-stone', level: null, conditions: { requires: 'Main Mission 12: A Rogue Mega Camerupt',  note: 'Defeat Rogue Mega Camerupt to receive Cameruptite' } },
  { group: 'LZA', games: 'all', pokemon: '71_1',  location: 'Battle zone (Lumiose City)', method: 'mega-stone', level: null, conditions: { requires: 'Main Mission 13: A Rogue Mega Victreebel', note: 'Defeat Rogue Mega Victreebel to receive Victreebellite' } },
  { group: 'LZA', games: 'all', pokemon: '15_1',  location: 'Battle zone (Lumiose City)', method: 'mega-stone', level: null, conditions: { requires: 'Main Mission 16: A Rogue Mega Beedrill',   note: 'Defeat Rogue Mega Beedrill to receive Beedrillite' } },
  { group: 'LZA', games: 'all', pokemon: '701_1', location: 'Battle zone (Lumiose City)', method: 'mega-stone', level: null, conditions: { requires: 'Main Mission 17: A Rogue Mega Hawlucha',   note: 'Defeat Rogue Mega Hawlucha to receive Hawluchite' } },
  { group: 'LZA', games: 'all', pokemon: '354_1', location: 'Battle zone (Lumiose City)', method: 'mega-stone', level: null, conditions: { requires: 'Main Mission 18: A Rogue Mega Banette',    note: 'Defeat Rogue Mega Banette to receive Banettite' } },
  { group: 'LZA', games: 'all', pokemon: '303_1', location: 'Battle zone (Lumiose City)', method: 'mega-stone', level: null, conditions: { requires: 'Main Mission 21: A Rogue Mega Mawile',     note: 'Defeat Rogue Mega Mawile to receive Mawilite' } },
  { group: 'LZA', games: 'all', pokemon: '181_1', location: 'Battle zone (Lumiose City)', method: 'mega-stone', level: null, conditions: { requires: 'Main Mission 23: A Rogue Mega Ampharos',   note: 'Defeat Rogue Mega Ampharos to receive Ampharosite' } },
  { group: 'LZA', games: 'all', pokemon: '334_1', location: 'Battle zone (Lumiose City)', method: 'mega-stone', level: null, conditions: { requires: 'Main Mission 28: A Rogue Mega Altaria',    note: 'Defeat Rogue Mega Altaria to receive Altarianite' } },
  { group: 'LZA', games: 'all', pokemon: '3_1',   location: 'Battle zone (Lumiose City)', method: 'mega-stone', level: null, conditions: { requires: 'Main Mission 29: A Rogue Mega Venusaur',   note: 'Defeat Rogue Mega Venusaur to receive Venusaurite' } },
  { group: 'LZA', games: 'all', pokemon: '149_1', location: 'Battle zone (Lumiose City)', method: 'mega-stone', level: null, conditions: { requires: 'Main Mission 32: A Rogue Mega Dragonite',  note: 'Defeat Rogue Mega Dragonite to receive Dragonite (Mega Stone)' } },
  { group: 'LZA', games: 'all', pokemon: '248_1', location: 'Battle zone (Lumiose City)', method: 'mega-stone', level: null, conditions: { requires: 'Main Mission 33: A Rogue Mega Tyranitar',  note: 'Defeat Rogue Mega Tyranitar to receive Tyranitarite' } },
  { group: 'LZA', games: 'all', pokemon: '121_1', location: 'Battle zone (Lumiose City)', method: 'mega-stone', level: null, conditions: { requires: 'Main Mission 34: A Rogue Mega Starmie',    note: 'Defeat Rogue Mega Starmie to receive Starminite' } },
  { group: 'LZA', games: 'all', pokemon: '689_1', location: 'Battle zone (Lumiose City)', method: 'mega-stone', level: null, conditions: { requires: 'Main Mission 22: A Rogue Mega Barbaracle',  note: 'Defeat Rogue Mega Barbaracle to receive Barbaracite' } },
  { group: 'LZA', games: 'all', pokemon: '478_1', location: 'Battle zone (Lumiose City)', method: 'mega-stone', level: null, conditions: { requires: 'Main Mission 27: A Rogue Mega Froslass',   note: 'Defeat Rogue Mega Froslass to receive Froslassite' } },
];

// ─────────────────────────────────────────────────────────────────────────────
// Runtime helpers
// ─────────────────────────────────────────────────────────────────────────────

async function ensureLocations(client, locationCache) {
  let created = 0;
  for (const loc of NEW_LOCATIONS) {
    const key = `${loc.name}|${loc.group}`;
    if (locationCache.has(key)) continue;
    if (DRY_RUN) {
      console.log(`[dry run] create location: "${loc.name}" (${loc.group})`);
      locationCache.set(key, -1); // placeholder so encounter lookups work in dry-run
      continue;
    }
    const { rows } = await client.query(
      `INSERT INTO game_locations (name, game_group, bulbapedia_slug, sort_order)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (name, game_group) DO NOTHING
       RETURNING id`,
      [loc.name, loc.group, loc.slug, loc.sort]
    );
    if (rows.length) {
      locationCache.set(key, rows[0].id);
      console.log(`location created: "${loc.name}" (${loc.group})`);
      created++;
    }
  }
  // Reload any newly inserted rows that were conflict-skipped
  const { rows } = await client.query(
    'SELECT id, name, game_group FROM game_locations'
  );
  for (const r of rows) locationCache.set(`${r.name}|${r.game_group}`, r.id);
  return created;
}

async function buildCaches(client) {
  const locRows = await client.query('SELECT id, name, game_group FROM game_locations');
  const locationCache = new Map();
  for (const r of locRows.rows) locationCache.set(`${r.name}|${r.game_group}`, r.id);

  const gameRows = await client.query('SELECT id, name, game_group FROM games');
  const gameByName  = new Map();
  const gameByGroup = new Map();
  for (const r of gameRows.rows) {
    gameByName.set(r.name, r);
    if (!gameByGroup.has(r.game_group)) gameByGroup.set(r.game_group, []);
    gameByGroup.get(r.game_group).push(r);
  }

  return { locationCache, gameByName, gameByGroup };
}

function resolveGames(enc, gameByName, gameByGroup) {
  if (enc.games === 'all') return gameByGroup.get(enc.group) || [];
  return enc.games.map(n => gameByName.get(n)).filter(Boolean);
}

function resolveLevel(level) {
  if (level == null) return [null, null];
  if (Array.isArray(level)) return [level[0], level[1]];
  return [level, level];
}

async function runCleanup(client, locationCache, gameByName) {
  let deleted = 0;
  for (const row of CLEANUP_WRONG) {
    const locId = locationCache.get(`${row.location}|${row.group}`);
    const game  = gameByName.get(row.game);
    if (!locId || !game) {
      console.warn(`cleanup skip — location or game not found: ${row.location} / ${row.game}`);
      continue;
    }
    if (DRY_RUN) {
      console.log(`[dry run] delete: ${row.pokemon_id} @ "${row.location}" (${row.game}) method=${row.method}`);
      continue;
    }
    const { rowCount } = await client.query(
      `DELETE FROM encounters
       WHERE location_id = $1 AND pokemon_id = $2 AND game_id = $3 AND encounter_method = $4`,
      [locId, row.pokemon_id, game.id, row.method]
    );
    if (rowCount) {
      console.log(`removed: ${row.pokemon_id} @ "${row.location}" (${row.game})`);
      deleted += rowCount;
    }
  }
  return deleted;
}

async function seedEncounters(client, locationCache, gameByName, gameByGroup) {
  let inserted = 0, replaced = 0, skipped = 0;

  for (const enc of ENCOUNTERS) {
    if (enc.skip) continue;
    if (!enc.pokemon) continue;

    const locId = locationCache.get(`${enc.location}|${enc.group}`);
    if (!locId) {
      console.warn(`location not found: "${enc.location}" (${enc.group}) — skipping ${enc.pokemon}`);
      skipped++;
      continue;
    }

    const games = resolveGames(enc, gameByName, gameByGroup);
    if (!games.length) {
      console.warn(`no games resolved for group=${enc.group} games=${JSON.stringify(enc.games)}`);
      skipped++;
      continue;
    }

    const [minLv, maxLv] = resolveLevel(enc.level);
    const conditions = JSON.stringify(enc.conditions || {});

    for (const game of games) {
      if (DRY_RUN) {
        console.log(`[dry run] ${enc.pokemon} @ "${enc.location}" (${game.name}) method=${enc.method} level=${enc.level ?? 'null'}`);
        inserted++;
        continue;
      }

      // Delete any existing row for this (location, pokémon, game, method) regardless of conditions
      const del = await client.query(
        `DELETE FROM encounters
         WHERE location_id = $1 AND pokemon_id = $2 AND game_id = $3 AND encounter_method = $4`,
        [locId, enc.pokemon, game.id, enc.method]
      );
      if (del.rowCount) replaced++;

      // Insert the new, properly-conditioned row
      try {
        await client.query(
          `INSERT INTO encounters
             (location_id, pokemon_id, game_id, encounter_method, min_level, max_level, encounter_rate, conditions)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           ON CONFLICT (location_id, pokemon_id, game_id, encounter_method, conditions) DO NOTHING`,
          [locId, enc.pokemon, game.id, enc.method, minLv, maxLv, null, conditions]
        );
        inserted++;
      } catch (err) {
        console.warn(`insert failed: ${enc.pokemon} @ "${enc.location}" (${game.name}): ${err.message}`);
        skipped++;
      }
    }
  }

  return { inserted, replaced, skipped };
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`Static Encounters${DRY_RUN ? ' — dry run' : ''}`);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { locationCache, gameByName, gameByGroup } = await buildCaches(client);

    console.log('Ensuring missing locations…');
    const locCreated = await ensureLocations(client, locationCache);

    console.log('Running cleanup…');
    const delCount = await runCleanup(client, locationCache, gameByName);

    console.log('Seeding encounters…');
    const { inserted, replaced, skipped } = await seedEncounters(client, locationCache, gameByName, gameByGroup);

    if (!DRY_RUN) {
      const { rowCount: tagged } = await client.query(`
        UPDATE game_locations gl
        SET    has_static_data = TRUE
        WHERE  has_static_data IS DISTINCT FROM TRUE
          AND  EXISTS (SELECT 1 FROM encounters e WHERE e.location_id = gl.id)
      `);
      if (tagged) console.log(`tagged ${tagged} locations with has_static_data`);
    }

    if (!DRY_RUN) await client.query('COMMIT');
    else await client.query('ROLLBACK');

    console.log(`done — ${inserted} inserted, ${replaced} replaced, ${skipped} skipped, ${locCreated} locations created, ${delCount} bad rows removed`);

    console.log('\nMega stone locations (scraped from Bulbapedia)…');
    const ms = await megaStones.run(client, { dryRun: DRY_RUN });
    console.log(`mega stones done — ${ms.inserted} inserted, ${ms.skipped} already existed`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('fatal error:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) main();

module.exports = { ENCOUNTERS, CLEANUP_WRONG, NEW_LOCATIONS };
