-- Migration 017: Add missing Mega Evolution forms introduced in Legends: Z-A.
-- All are new Mega forms not in the main series; types default to base form
-- until confirmed data is available. Icons follow pokemondb naming convention.
-- ON CONFLICT DO NOTHING makes this safe to re-run.

INSERT INTO pokedex (id, pokedex_number, name, form_name, type1, type2, generation, form_tag, icon_url, visible)
VALUES
  -- ── Kanto ────────────────────────────────────────────────────────────────
  ('36_1',  36,  'Clefable',   'Mega Clefable',    'Fairy',    NULL,      9, 'Mega', 'https://img.pokemondb.net/sprites/home/normal/clefable-mega.png',     TRUE),
  ('121_1', 121, 'Starmie',    'Mega Starmie',     'Water',    'Psychic', 9, 'Mega', 'https://img.pokemondb.net/sprites/home/normal/starmie-mega.png',      TRUE),
  -- Raichu has two Mega forms: X (regular) and Y (Alolan). 26_1 = Alolan Raichu.
  ('26_2',  26,  'Raichu',     'Mega Raichu X',    'Electric', NULL,      9, 'Mega', 'https://img.pokemondb.net/sprites/home/normal/raichu-mega-x.png',     TRUE),
  ('26_3',  26,  'Raichu',     'Mega Raichu Y',    'Electric', 'Psychic', 9, 'Mega', 'https://img.pokemondb.net/sprites/home/normal/raichu-mega-y.png',     TRUE),

  -- ── Johto ────────────────────────────────────────────────────────────────
  ('154_1', 154, 'Meganium',   'Mega Meganium',    'Grass',    NULL,      9, 'Mega', 'https://img.pokemondb.net/sprites/home/normal/meganium-mega.png',     TRUE),
  ('160_1', 160, 'Feraligatr', 'Mega Feraligatr',  'Water',    NULL,      9, 'Mega', 'https://img.pokemondb.net/sprites/home/normal/feraligatr-mega.png',   TRUE),

  -- ── Hoenn ────────────────────────────────────────────────────────────────
  ('358_1', 358, 'Chimecho',   'Mega Chimecho',    'Psychic',  NULL,      9, 'Mega', 'https://img.pokemondb.net/sprites/home/normal/chimecho-mega.png',     TRUE),

  -- ── Sinnoh ───────────────────────────────────────────────────────────────
  ('398_1', 398, 'Staraptor',  'Mega Staraptor',   'Normal',   'Flying',  9, 'Mega', 'https://img.pokemondb.net/sprites/home/normal/staraptor-mega.png',    TRUE),
  ('478_1', 478, 'Froslass',   'Mega Froslass',    'Ice',      'Ghost',   9, 'Mega', 'https://img.pokemondb.net/sprites/home/normal/froslass-mega.png',     TRUE),
  ('485_1', 485, 'Heatran',    'Mega Heatran',     'Fire',     'Steel',   9, 'Mega', 'https://img.pokemondb.net/sprites/home/normal/heatran-mega.png',      TRUE),
  ('491_1', 491, 'Darkrai',    'Mega Darkrai',     'Dark',     NULL,      9, 'Mega', 'https://img.pokemondb.net/sprites/home/normal/darkrai-mega.png',      TRUE),

  -- ── Unova ────────────────────────────────────────────────────────────────
  ('500_1', 500, 'Emboar',     'Mega Emboar',      'Fire',     'Fighting',9, 'Mega', 'https://img.pokemondb.net/sprites/home/normal/emboar-mega.png',       TRUE),
  ('530_1', 530, 'Excadrill',  'Mega Excadrill',   'Ground',   'Steel',   9, 'Mega', 'https://img.pokemondb.net/sprites/home/normal/excadrill-mega.png',    TRUE),
  ('545_1', 545, 'Scolipede',  'Mega Scolipede',   'Bug',      'Poison',  9, 'Mega', 'https://img.pokemondb.net/sprites/home/normal/scolipede-mega.png',    TRUE),
  ('560_1', 560, 'Scrafty',    'Mega Scrafty',     'Dark',     'Fighting',9, 'Mega', 'https://img.pokemondb.net/sprites/home/normal/scrafty-mega.png',      TRUE),
  ('604_1', 604, 'Eelektross', 'Mega Eelektross',  'Electric', NULL,      9, 'Mega', 'https://img.pokemondb.net/sprites/home/normal/eelektross-mega.png',   TRUE),
  ('609_1', 609, 'Chandelure', 'Mega Chandelure',  'Ghost',    'Fire',    9, 'Mega', 'https://img.pokemondb.net/sprites/home/normal/chandelure-mega.png',   TRUE),
  ('623_1', 623, 'Golurk',     'Mega Golurk',      'Ground',   'Ghost',   9, 'Mega', 'https://img.pokemondb.net/sprites/home/normal/golurk-mega.png',       TRUE),

  -- ── Kalos ────────────────────────────────────────────────────────────────
  ('652_1', 652, 'Chesnaught', 'Mega Chesnaught',  'Grass',    'Fighting',9, 'Mega', 'https://img.pokemondb.net/sprites/home/normal/chesnaught-mega.png',   TRUE),
  ('655_1', 655, 'Delphox',    'Mega Delphox',     'Fire',     'Psychic', 9, 'Mega', 'https://img.pokemondb.net/sprites/home/normal/delphox-mega.png',      TRUE),
  -- 658_1 = Ash-Greninja; Mega Greninja is 658_2
  ('658_2', 658, 'Greninja',   'Mega Greninja',    'Water',    'Dark',    9, 'Mega', 'https://img.pokemondb.net/sprites/home/normal/greninja-mega.png',     TRUE),
  ('668_1', 668, 'Pyroar',     'Mega Pyroar',      'Fire',     'Normal',  9, 'Mega', 'https://img.pokemondb.net/sprites/home/normal/pyroar-mega.png',       TRUE),
  ('670_1', 670, 'Floette',    'Mega Floette',     'Fairy',    NULL,      9, 'Mega', 'https://img.pokemondb.net/sprites/home/normal/floette-mega.png',      TRUE),
  -- 678 = Male Meowstic, 678_1 = Female Meowstic; Mega Meowstic is 678_2
  ('678_2', 678, 'Meowstic',   'Mega Meowstic',    'Psychic',  NULL,      9, 'Mega', 'https://img.pokemondb.net/sprites/home/normal/meowstic-mega.png',     TRUE),
  ('689_1', 689, 'Barbaracle', 'Mega Barbaracle',  'Rock',     'Water',   9, 'Mega', 'https://img.pokemondb.net/sprites/home/normal/barbaracle-mega.png',   TRUE),
  ('691_1', 691, 'Dragalge',   'Mega Dragalge',    'Poison',   'Dragon',  9, 'Mega', 'https://img.pokemondb.net/sprites/home/normal/dragalge-mega.png',     TRUE),
  -- 718 = 50% Forme, 718_1 = 10% Forme, 718_2 = Complete Forme; Mega Zygarde is 718_3
  ('718_3', 718, 'Zygarde',    'Mega Zygarde',     'Dragon',   'Ground',  9, 'Mega', 'https://img.pokemondb.net/sprites/home/normal/zygarde-mega.png',      TRUE),

  -- ── Alola ────────────────────────────────────────────────────────────────
  ('740_1', 740, 'Crabominable','Mega Crabominable','Fighting', 'Ice',    9, 'Mega', 'https://img.pokemondb.net/sprites/home/normal/crabominable-mega.png', TRUE),
  ('768_1', 768, 'Golisopod',  'Mega Golisopod',   'Water',    'Bug',     9, 'Mega', 'https://img.pokemondb.net/sprites/home/normal/golisopod-mega.png',    TRUE),
  ('780_1', 780, 'Drampa',     'Mega Drampa',      'Normal',   'Dragon',  9, 'Mega', 'https://img.pokemondb.net/sprites/home/normal/drampa-mega.png',       TRUE),
  -- 801_1 reserved for Original Color Magearna in other contexts; here it is Mega Magearna
  ('801_1', 801, 'Magearna',   'Mega Magearna',    'Steel',    'Fairy',   9, 'Mega', 'https://img.pokemondb.net/sprites/home/normal/magearna-mega.png',     TRUE),
  ('807_1', 807, 'Zeraora',    'Mega Zeraora',     'Electric', NULL,      9, 'Mega', 'https://img.pokemondb.net/sprites/home/normal/zeraora-mega.png',      TRUE),

  -- ── Galar ────────────────────────────────────────────────────────────────
  ('870_1', 870, 'Falinks',    'Mega Falinks',     'Fighting', NULL,      9, 'Mega', 'https://img.pokemondb.net/sprites/home/normal/falinks-mega.png',      TRUE),

  -- ── Paldea ───────────────────────────────────────────────────────────────
  ('952_1', 952, 'Scovillain', 'Mega Scovillain',  'Grass',    'Fire',    9, 'Mega', 'https://img.pokemondb.net/sprites/home/normal/scovillain-mega.png',   TRUE),
  ('970_1', 970, 'Glimmora',   'Mega Glimmora',    'Rock',     'Poison',  9, 'Mega', 'https://img.pokemondb.net/sprites/home/normal/glimmora-mega.png',     TRUE),
  -- 978 = Curly Form, 978_1 = Droopy, 978_2 = Stretchy; Mega Tatsugiri is 978_3
  ('978_3', 978, 'Tatsugiri',  'Mega Tatsugiri',   'Dragon',   'Water',   9, 'Mega', 'https://img.pokemondb.net/sprites/home/normal/tatsugiri-mega.png',    TRUE),
  ('998_1', 998, 'Baxcalibur', 'Mega Baxcalibur',  'Dragon',   'Ice',     9, 'Mega', 'https://img.pokemondb.net/sprites/home/normal/baxcalibur-mega.png',   TRUE),

  -- ── Skarmory (Gen 2 but caught here for completeness) ────────────────────
  ('227_1', 227, 'Skarmory',   'Mega Skarmory',    'Steel',    'Flying',  9, 'Mega', 'https://img.pokemondb.net/sprites/home/normal/skarmory-mega.png',     TRUE)
ON CONFLICT (id) DO NOTHING;
