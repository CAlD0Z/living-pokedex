INSERT INTO games (name, game_group, generation, sort_order) VALUES
    ('Brilliant Diamond', 'BDSP', 8, 100),
    ('Shining Pearl',     'BDSP', 8, 400)
ON CONFLICT (name) DO NOTHING;

UPDATE _meta SET value = '7' WHERE key = 'schema_version';
