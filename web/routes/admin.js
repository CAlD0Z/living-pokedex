'use strict';

const express = require('express');
const { pool, clearStaticCaches } = require('../db');
const {
  handleScraperRun, handleScraperStop,
  handleRunAll, handleRunIncomplete, handleRunStatic,
  handleScraperForceReset, handleStaticEncountersTable,
  handleLocationsTable,
} = require('../scraper');
const { locationsPage } = require('../auth/views');

module.exports = function makeAdminRouter(auth) {
  const router = express.Router();

  // All routes in this file require admin.
  router.use(auth.requireAdmin);

  // ── Scraper controls ────────────────────────────────────────────────────────
  router.post('/admin/scraper/run',                handleScraperRun);
  router.post('/admin/scraper/stop',               handleScraperStop);
  router.post('/admin/scraper/run-all',            handleRunAll);
  router.post('/admin/scraper/run-incomplete',     handleRunIncomplete);
  router.post('/admin/scraper/run-static',         handleRunStatic);
  router.post('/admin/scraper/force-reset',        handleScraperForceReset);
  router.get('/admin/scraper/static-encounters-table', handleStaticEncountersTable);
  router.get('/admin/scraper/locations-table',         handleLocationsTable);
  router.get('/admin/locations', (req, res) => res.send(locationsPage(req.user)));

  // ── Pokédex visibility / tagging ────────────────────────────────────────────
  router.patch('/api/pokedex', async (req, res) => {
    const changes = req.body;
    if (!Array.isArray(changes) || !changes.length) return res.status(400).json({ error: 'No changes provided' });
    const VALID_TAGS = new Set(['Mega', 'Alolan', 'Galarian', 'Hisuian', 'Paldean', 'Forms', 'Other', null]);
    for (const change of changes) {
      if (!change.pokemon_id) return res.status(400).json({ error: 'Missing pokemon_id' });
      if ('form_tag' in change && !VALID_TAGS.has(change.form_tag)) return res.status(400).json({ error: `Invalid form_tag: ${change.form_tag}` });
      if ('visible' in change && typeof change.visible !== 'boolean') return res.status(400).json({ error: 'visible must be boolean' });
    }
    try {
      const tagChanges = changes.filter(c => 'form_tag' in c);
      const visChanges = changes.filter(c => 'visible'  in c);
      await Promise.all([
        tagChanges.length && pool.query(
          `UPDATE pokedex SET form_tag = v.tag
           FROM (SELECT unnest($1::text[]) AS id, unnest($2::text[]) AS tag) v
           WHERE pokedex.id = v.id`,
          [tagChanges.map(c => c.pokemon_id), tagChanges.map(c => c.form_tag ?? null)]
        ),
        visChanges.length && pool.query(
          `UPDATE pokedex SET visible = v.vis
           FROM (SELECT unnest($1::text[]) AS id, unnest($2::boolean[]) AS vis) v
           WHERE pokedex.id = v.id`,
          [visChanges.map(c => c.pokemon_id), visChanges.map(c => c.visible)]
        ),
      ].filter(Boolean));
      // Invalidate cached totals so visibility changes are reflected immediately.
      clearStaticCaches();
      res.json({ ok: true, updated: changes.length });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  return router;
};
