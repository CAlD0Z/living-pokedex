ALTER TABLE pokedex ADD COLUMN IF NOT EXISTS form_tag TEXT;

-- Regional variants first
UPDATE pokedex SET form_tag = 'Regional'
  WHERE form_name IS NOT NULL
    AND (form_name ~* 'alola' OR form_name ~* 'galar' OR form_name ~* 'hisui' OR form_name ~* 'paldea');

-- Mega evolutions
UPDATE pokedex SET form_tag = 'Mega'
  WHERE form_name ~* 'mega' AND form_tag IS NULL;

-- Everything else with a form_name
UPDATE pokedex SET form_tag = 'Other'
  WHERE form_name IS NOT NULL AND form_tag IS NULL;
