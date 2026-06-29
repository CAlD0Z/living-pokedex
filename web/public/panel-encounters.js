// Encounter rendering for the detail panel.

const SV_MAP_GROUPS = new Set(['SV', 'Kita', 'BB']);

// Friend Safari makes almost every Kalos species "available", which floods the
// X/Y encounter view. Hide those encounters by default; they reappear only when
// the user explicitly selects the "Friend Safari" location filter.
function _friendSafariSelected() {
  const sel = document.getElementById('location-select');
  return !!sel && sel.value.trim().toLowerCase() === 'friend safari';
}
function _isFriendSafari(enc) {
  return (enc.location_name || '').trim().toLowerCase() === 'friend safari';
}

// Sub-area slugs that have dedicated map files (location-slug → Set of area-slugs).
const SV_SUBAREA_MAPS = {
  'glaseado-mountain': new Set(['northern-mountain','southern-mountain']),
  'coastal-biome':     new Set(['southeast-beach','torchlit-mountain','rest-area-cave','bridgeside-cave']),
  'crystal-pool':      new Set(['lake-caves']),
  'dalizapa-passage':  new Set(['northern-passage','western-passage']),
  'infernal-pass':     new Set(['north-cave','west-cave']),
  'oni-mountain':      new Set(['foot-of-oni-mountain']),
  'polar-biome':       new Set(['mountain','north-mountain-cave','east-mountain-cave','polar-plaza-cave','iceberg-cave']),
  'reveler-s-road':    new Set(['crater']),
  'savanna-biome':     new Set(['savanna-entrance','northeast-savanna','midwest-savanna','central-plaza-cave','savanna-plaza-cave']),
  'wistful-fields':    new Set(['wisteria-pond','patchy-field']),
};

function _svMapSlug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function showSvMapTooltip(btn, locationName, area) {
  const section = document.getElementById('sv-map-section');
  if (!section) return;
  const locSlug  = _svMapSlug(locationName);
  const areaSlug = area ? _svMapSlug(area) : '';
  const hasSub   = areaSlug && SV_SUBAREA_MAPS[locSlug]?.has(areaSlug);
  const src      = hasSub ? `/maps/sv/${locSlug}--${areaSlug}.png` : `/maps/sv/${locSlug}.png`;
  let img = section.querySelector('img');
  if (!img) {
    img = document.createElement('img');
    img.style.cssText = 'display:block;width:100%;border-radius:6px;object-fit:contain;max-height:200px';
    section.appendChild(img);
  }
  if (img.dataset.src === src && img.complete && img.naturalWidth) {
    section.style.display = 'block';
    return;
  }
  section.style.display = 'none';
  img.dataset.src = src;
  img.onerror = () => { section.style.display = 'none'; };
  img.onload  = () => { section.style.display = 'block'; };
  img.src = src;
}

function hideSvMapTooltip() {
  const section = document.getElementById('sv-map-section');
  if (section) section.style.display = 'none';
}

const ENCOUNTER_COLS = {
  RBY:  ['Location','Game','Method','Levels','Rate'],
  RSE:  ['Location','Game','Method','Condition','Levels','Rate'],
  GSC:  ['Location','Game','Method','Time','Condition','Levels','Rate'],
  HGSS: ['Location','Game','Method','Time','Condition','Levels','Rate'],
  DPPT: ['Location','Game','Method','Condition','Levels','Rate'],
  BDSP: ['Location','Game','Method','Time','Condition','Levels','Rate'],
  BW:   ['Location','Game','Method','Season','Condition','Levels','Rate'],
  BW2:  ['Location','Game','Method','Season','Condition','Levels','Rate'],
  SwSh: ['Location','Game','Method','Weather','Condition','Levels','Rate'],
  IoA:  ['Location','Game','Method','Weather','Condition','Levels','Rate'],
  CT:   ['Location','Game','Method','Weather','Condition','Levels','Rate'],
  ORAS: ['Location','Game','Method','Condition','Levels','Rate'],
  PLA:  ['Location','Method','Condition','Levels','Rate','Alpha'],
  SV:   ['Location','Game','Method','Time','Terrain','Biome','Levels','Rate'],
  Kita: ['Location','Game','Method','Time','Terrain','Biome','Levels','Rate'],
  BB:   ['Location','Game','Method','Time','Terrain','Biome','Levels','Rate'],
};
const DEFAULT_ENC_COLS = ['Location','Game','Method','Levels','Rate'];

const GAME_DISPLAY_NAME = {
  'SW - Isle of Armor':'Sword',  'SH - Isle of Armor':'Shield',
  'SW - Crown Tundra':'Sword',   'SH - Crown Tundra':'Shield',
  'S - Kitakami':'Scarlet',      'V - Kitakami':'Violet',
  'S - Blueberry':'Scarlet',     'V - Blueberry':'Violet',
};

function stableJson(obj) {
  if (!obj) return 'null';
  return JSON.stringify(Object.fromEntries(Object.entries(obj).sort()));
}

function mergeEncounters(encounters) {
  const seen = new Map();
  for (const enc of encounters) {
    const key = [enc.location_name, enc.encounter_method, enc.min_level,
                 enc.max_level, enc.encounter_rate, stableJson(enc.conditions)].join(' ');
    if (!seen.has(key)) seen.set(key, { enc: { ...enc }, games: [] });
    seen.get(key).games.push(enc.game_name);
  }
  return [...seen.values()].map(({ enc, games }) => { enc._games = games; return enc; });
}

function I(n) { return '<i class="bi bi-' + n + ' ei"></i>'; }

const WEATHER_ICON = {
  'clear':I('sun'),'sunny':I('sun'),'no cloud':I('sun'),
  'overcast':I('cloud'),'cloudy':I('cloud'),'normal':I('cloud'),
  'rain':I('cloud-rain'),'rainy':I('cloud-rain'),'raining':I('cloud-rain'),
  'thunderstorm':I('cloud-lightning-rain'),'thunder':I('cloud-lightning-rain'),
  'snow':I('cloud-snow'),'snowing':I('cloud-snow'),'snowy':I('cloud-snow'),
  'blizzard':I('cloud-snow'),'heavy snow':I('cloud-snow'),
  'intense sun':I('thermometer-sun'),'harsh sun':I('thermometer-sun'),
  'sandstorm':I('tornado'),'sand storm':I('tornado'),
  'fog':I('cloud-fog2'),'heavy fog':I('cloud-fog2'),'mist':I('cloud-fog2'),
  'hail':I('cloud-hail'),'icy':I('cloud-snow'),
};
const TIME_ICON = {
  'morning':I('sunrise'),'dawn':I('sunrise'),
  'day':I('sun'),'daytime':I('sun'),'afternoon':I('sun'),'midday':I('sun'),
  'evening':I('sunset'),'dusk':I('sunset'),
  'night':I('moon-stars'),'midnight':I('moon-stars'),
};
const SEASON_ICON = {
  'spring':I('flower1'),'summer':I('thermometer-sun'),
  'autumn':I('leaf'),'fall':I('leaf'),'winter':I('cloud-snow'),
};
const METHOD_LABEL = {
  'wild':'Wild','wild-pokemon':'Wild','walk':'Walking','walking':'Walking',
  'grass':'Grass','tall-grass':'Tall Grass','tall grass':'Tall Grass',
  'long-grass':'Long Grass','long grass':'Long Grass','dark-grass':'Dark Grass',
  'rustling-grass':'Rustling Grass','rustling-bush':'Rustling Bush',
  'rustling-tree':'Rustling Tree','rustling-berry-tree':'Rustling Berry Tree',
  'berry-pile':'Berry Pile','berry-tree':'Berry Tree',
  'surf':'Surfing','surfing':'Surfing','water':'Surfing',
  'rippling-water':'Rippling Water','sea-skim':'Sea Skim',
  'puddle':'Puddle','puddles':'Puddle','water-splashes':'Water Splashes',
  'dive':'Diving','underwater':'Underwater','seaweed':'Seaweed',
  'old-rod':'Old Rod','good-rod':'Good Rod','super-rod':'Super Rod',
  'fishing':'Fishing','fish':'Fishing',
  'fishing-old-rod':'Old Rod','fishing-good-rod':'Good Rod','fishing-super-rod':'Super Rod',
  'rock-smash':'Rock Smash','rock smash':'Rock Smash',
  'headbutt':'Headbutt','headbutt-normal':'Headbutt','headbutt-special':'Headbutt (Special)',
  'cave':'Cave','ceiling':'Ceiling','rough':'Rocky Ground',
  'sand':'Sand','sand-cloud':'Sand Cloud','deep-sand':'Deep Sand',
  'dirt':'Dirt','dirt-cloud':'Dirt Cloud','dust-cloud':'Dust Cloud',
  'snow':'Snow','swamp':'Swamp','beach':'Beach',
  'air':'Air','flying':'Flying','midair':'Midair','sky':'Sky',
  "flying-pokémon's-shadow":'Flying Shadow','flocks':'Flocks',
  'gift':'Gift','static':'Static','fixed':'Fixed','egg':'Egg',
  'fossil':'Fossil','shadow':'Shadow','mega-stone':'Mega Stone',
  'only-one':'One-Time','unique':'Unique','special':'Special Spawn',
  'chase':'Chase','group':'Group','horde-encounter':'Horde','swarm':'Swarm',
  'honey':'Honey Tree','backlot':'Trophy Garden','hidden-grotto':'Hidden Hollow',
  'hoenn-sound':'Hoenn Sound','sinnoh-sound':'Sinnoh Sound',
  'pokeradar':'Poké Radar','poke-radar':'Poké Radar','poké-radar':'Poké Radar','radar':'Poké Radar',
  'slots':'Trophy Garden','sos':'SOS Battle',
  'wormhole':'Ultra Wormhole','ultra-wormhole':'Ultra Wormhole',
  'overworld':'Overworld','mass-outbreak':'Mass Outbreak',
  'space-time':'Space-Time Distortion','wanderer':'Wanderer','fixed-alpha':'Fixed Alpha',
  'terrain':'Terrain','curry':'Curry','inside':'Inside','entrance':'Entrance',
  'shaking-trash-cans':'Trash Can',
  'purple-flowers':'Purple Flowers','red-flowers':'Red Flowers','yellow-flowers':'Yellow Flowers',
  'prize':'Prize','basement':'Underground','lowest-floor':'Lowest Floor',
  "volcarona's-room":"Volcarona's Room",
  "volcarona's-room-and-the-nearby-room":"Volcarona's Room",
  'dual-slot-any-gen-iii':'Dual-Slot (Gen III)','dual-slot-emerald':'Dual-Slot (Emerald)',
  'dual-slot-firered':'Dual-Slot (FireRed)','dual-slot-leafgreen':'Dual-Slot (LeafGreen)',
  'dual-slot-ruby':'Dual-Slot (Ruby)','dual-slot-sapphire':'Dual-Slot (Sapphire)',
  'dual-slot-frlg-e':'Dual-Slot (FRLG/E)',
};
const METHOD_ICON = {
  'Wild':I('tree'),'Grass':I('tree'),'Walking':I('tree'),
  'Tall Grass':I('tree'),'Long Grass':I('tree'),'Dark Grass':I('tree-fill'),
  'Rustling Grass':I('tree'),'Rustling Bush':I('tree'),
  'Rustling Tree':I('tree'),'Rustling Berry Tree':I('tree'),
  'Berry Pile':I('circle'),'Berry Tree':I('tree'),
  'Cave':I('mountains'),'Ceiling':I('house'),'Rocky Ground':I('mountains'),
  'Surfing':I('water'),'Rippling Water':I('water'),
  'Sea Skim':I('water'),'Water Splashes':I('droplet'),'Puddle':I('droplet'),
  'Diving':I('moisture'),'Underwater':I('moisture'),'Seaweed':I('water'),
  'Old Rod':I('fish'),'Good Rod':I('fish'),'Super Rod':I('fish'),'Fishing':I('fish'),
  'Rock Smash':I('hammer'),'Headbutt':I('tree'),'Headbutt (Special)':I('tree'),
  'Sand':I('sun'),'Sand Cloud':I('sun'),'Deep Sand':I('sun'),
  'Dirt':I('circle-fill'),'Dirt Cloud':I('tornado'),'Dust Cloud':I('tornado'),
  'Snow':I('cloud-snow'),'Swamp':I('water'),'Beach':I('sun'),
  'Air':I('wind'),'Flying':I('wind'),'Midair':I('wind'),'Sky':I('wind'),
  'Flying Shadow':I('eye'),'Flocks':I('people'),
  'Gift':I('gift'),'Static':I('lightning'),'Fixed':I('pin-map'),'Mega Stone':I('gem'),
  'Egg':I('egg'),'Fossil':I('clock-history'),'Shadow':I('eye-slash'),
  'One-Time':I('star'),'Unique':I('stars'),'Special Spawn':I('stars'),
  'Chase':I('person-running'),'Group':I('people'),'Horde':I('people'),'Swarm':I('bug'),
  'Honey Tree':I('tree'),'Trophy Garden':I('trophy'),'Hidden Hollow':I('circle'),
  'Hoenn Sound':I('music-note-beamed'),'Sinnoh Sound':I('music-note-beamed'),
  'Poké Radar':I('broadcast'),'SOS Battle':I('megaphone'),
  'Ultra Wormhole':I('globe'),'Overworld':I('eye'),'Mass Outbreak':I('exclamation-triangle'),
  'Space-Time Distortion':I('stars'),'Wanderer':I('map'),'Fixed Alpha':I('shield-fill'),
  'Terrain':I('mountains'),'Curry':I('cup-hot'),'Inside':I('house'),'Entrance':I('door-open'),
  'Trash Can':I('trash'),
  'Purple Flowers':I('flower1'),'Red Flowers':I('flower1'),'Yellow Flowers':I('flower1'),
  'Prize':I('trophy'),'Underground':I('layers'),'Lowest Floor':I('layers'),
  "Volcarona's Room":I('star'),
  'Dual-Slot (Gen III)':I('controller'),'Dual-Slot (Emerald)':I('controller'),
  'Dual-Slot (FireRed)':I('controller'),'Dual-Slot (LeafGreen)':I('controller'),
  'Dual-Slot (Ruby)':I('controller'),'Dual-Slot (Sapphire)':I('controller'),
  'Dual-Slot (FRLG/E)':I('controller'),
};

function fmtMethod(m) {
  if (!m) return '';
  const k = m.toLowerCase().replace(/_/g,'-').trim();
  if (/^b?d+f(-b?d+f)?$/.test(k))
    return I('layers') + ' ' + m.toUpperCase().replace(/-/g,'–');
  if (k.startsWith('trade-'))
    return I('arrow-left-right') + ' Trade (' + m.slice(6).replace(/[-_]/g,' ').replace(/\b\w/g,c=>c.toUpperCase()) + ')';
  if (k.startsWith('revive-'))
    return I('clock-history') + ' ' + m.slice(7).replace(/[-_]/g,' ').replace(/&/g,'&amp;').replace(/\b\w/g,c=>c.toUpperCase());
  const label = METHOD_LABEL[k] || m.replace(/[-_]/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
  const icon  = METHOD_ICON[label] || I('question-circle');
  return icon + ' ' + label;
}

function fmtCondition(type, val) {
  if (!val) return null;
  const key   = String(val).toLowerCase().replace(/_/g,' ').trim();
  const icon  = type==='weather' ? (WEATHER_ICON[key]||'')
              : type==='time'    ? (TIME_ICON[key]||'')
              : type==='season'  ? (SEASON_ICON[key]||'')
              : '';
  const label = String(val).replace(/[-_]/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
  return (icon ? icon+' ' : '') + label;
}

function renderEncounterTable(gameGroup, encounters, activeName) {
  const cols = ENCOUNTER_COLS[gameGroup] ?? DEFAULT_ENC_COLS;
  const GAME_COLORS = window.__LD.GAME_COLORS;

  function encCard(enc) {
    const games = enc._games || [enc.game_name];
    const lvl = enc.min_level == null ? null
      : enc.min_level === enc.max_level ? `Lv ${enc.min_level}`
      : `Lv ${enc.min_level}–${enc.max_level}`;
    const rate = enc.encounter_rate != null ? enc.encounter_rate + '%' : null;
    const url  = 'https://bulbapedia.bulbagarden.net/wiki/' + encodeURIComponent(enc.location_name.replace(/ /g,'_'));
    const c    = enc.conditions || {};
    const methodLabel = fmtMethod(enc.encounter_method);

    const gameChips = games.map(g => {
      const col = GAME_COLORS[g] ?? '#a0aec0';
      const lbl = GAME_DISPLAY_NAME[g] ?? g;
      return `<span style="color:${col};font-weight:700;font-size:10px">${lbl}</span>`;
    }).join(`<span style="color:#2a3a50;margin:0 1px;font-size:10px">/</span>`);

    function tag(inner, opts) {
      const o  = opts || {};
      const t  = o.title  ? ` title="${String(o.title).replace(/"/g,'&quot;')}"` : '';
      const bg = o.bg     || '#0b1520';
      const cl = o.color  || '#8fa8c4';
      const bd = o.border || '#162030';
      return `<span${t} style="background:${bg};color:${cl};padding:1px 7px;border-radius:10px;font-size:10px;white-space:nowrap;border:1px solid ${bd}">${inner}</span>`;
    }

    const tags = [];
    if (cols.includes('Time')    && c.time)    tags.push(tag(fmtCondition('time',    c.time)));
    if (cols.includes('Weather') && c.weather) tags.push(tag(fmtCondition('weather', c.weather)));
    if (cols.includes('Season')  && c.season)  tags.push(tag(fmtCondition('season',  c.season)));
    if (cols.includes('Biome')) {
      const area  = c.area  ? c.area.replace(/[-_]/g,' ').replace(/\b\w/g,x=>x.toUpperCase())  : null;
      const biome = c.biome ? c.biome.replace(/[-_]/g,' ').replace(/\b\w/g,x=>x.toUpperCase()) : null;
      if (area || biome) tags.push(tag(I('geo-alt') + ' ' + (area && biome ? area+' ('+biome+')' : area||biome)));
    }
    if (cols.includes('Condition')) {
      if (c.floor)                tags.push(tag(I('layers') + ' ' + c.floor.replace(/\s+encounters$/i,'').trim().replace(/\b\w/g,x=>x.toUpperCase())));
      if (c.swarm)                tags.push(tag(I('bug') + ' ' + c.swarm.replace(/\b\w/g,x=>x.toUpperCase())+' Swarm'));
      if (c.headbutt_odds)        tags.push(tag(I('tree') + ' ' + c.headbutt_odds+' Odds'));
      if (c.pokeradar)            tags.push(tag(I('broadcast') + ' Poké Radar'));
      if (c.gba_cartridge)        tags.push(tag(I('controller') + ' GBA Cart'));
      if (c.bug_catching_contest) tags.push(tag(I('bug') + ' Bug Contest'));
      if (c.dexnav)               tags.push(tag(I('compass') + ' DexNav'));
      if (c.outbreak)             tags.push(tag(I('exclamation-triangle') + ' Mass Outbreak'));
      if (c.special)              tags.push(tag(I('stars') + ' Special'));
    }
    if (cols.includes('Terrain') && c.terrain && c.terrain !== enc.encounter_method)
      tags.push(tag(I('mountains') + ' ' + c.terrain.replace(/[-_]/g,' ').replace(/\b\w/g,x=>x.toUpperCase())));
    if (cols.includes('Alpha') && c.alpha) tags.push(tag(I('shield-fill') + ' Alpha'));
    if (c.gender) {
      const isF = c.gender === 'female';
      tags.push(tag(isF ? '♀' : '♂', { color: isF ? '#f484a8' : '#7ab4ff', bg: isF ? '#1a0a14' : '#0a1020', border: isF ? '#3a1a28' : '#1a2840' }));
    }
    if (c.stone)                        tags.push(tag(I('gem') + ' ' + c.stone));
    if (c.acquisition === 'repeatable') tags.push(tag(I('arrow-repeat') + ' Purchase'));
    if (c.acquisition === 'finite')     tags.push(tag(I('star') + ' One-Time',            { color: '#d0a050', bg: '#1a1200', border: '#3a2500' }));

    // ── Special-encounter condition tags ─────────────────────────────────────
    if (c.postgame)
      tags.push(tag(I('flag') + ' Postgame',       { color: '#e8a930', bg: '#1a1200', border: '#3a2800' }));
    if (c.roaming)
      tags.push(tag(I('map') + ' Roaming',         { color: '#5cc8a8', bg: '#001a12', border: '#0a3022' }));
    if (c.event) {
      const evLabel = c.event_item ? 'Event: ' + c.event_item : 'Event Only';
      tags.push(tag(I('ticket') + ' ' + evLabel,   { color: '#e05080', bg: '#1a0010', border: '#3a0020' }));
    }
    if (c.shiny)
      tags.push(tag(I('star-fill') + ' Always Shiny', { color: '#f0c040', bg: '#1a1600', border: '#3a2e00' }));
    if (c.day)
      tags.push(tag(I('calendar3') + ' ' + c.day + ' only', { color: '#70a8d0', bg: '#0a1520', border: '#1a3040' }));
    if (c.disguised)
      tags.push(tag(I('eye-slash') + ' Disguised', { color: '#a070d0', bg: '#120a1a', border: '#2a1540' }));
    if (c.requires) {
      const reqs = Array.isArray(c.requires) ? c.requires : [c.requires];
      for (const req of reqs) {
        if (/side\s*mission/i.test(req)) {
          const name  = req.replace(/^side\s*mission\s*\d*[:\s]*/i, '').split(/[;,]/)[0].trim();
          const short = name.length > 30 ? name.slice(0, 29) + '…' : name;
          tags.push(tag(I('list-task') + ' Sidequest: ' + short, { title: req, color: '#7ab4ff', bg: '#0a1530', border: '#1a3060' }));
        } else if (/main\s*mission/i.test(req)) {
          const name  = req.replace(/^main\s*mission\s*\d*[:\s]*/i, '').split(/[;,]/)[0].trim();
          const short = name.length > 30 ? name.slice(0, 29) + '…' : name;
          tags.push(tag(I('list-check') + ' Mission: ' + short, { title: req, color: '#a0c4ff', bg: '#0a1530', border: '#1a3060' }));
        } else {
          const short = req.length > 36 ? req.slice(0, 35) + '…' : req;
          tags.push(tag(I('key') + ' ' + short, { title: req }));
        }
      }
    }
    if (c.note) {
      const short = c.note.length > 40 ? c.note.slice(0, 39) + '…' : c.note;
      tags.push(tag(I('info-circle') + ' ' + short, { title: c.note, color: '#88a4c0', bg: '#0a1520', border: '#162030' }));
    }

    const tagHtml = tags.join('');

    return `<div style="background:linear-gradient(160deg,#0c1628,#091020);border:1px solid #182035;border-radius:8px;padding:8px 11px;margin-bottom:5px">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:5px">
        <button data-loc="${enc.location_name.replace(/"/g,'&quot;')}" data-area="${(c.area||'').replace(/"/g,'&quot;')}" onclick="filterByLocation(this.dataset.loc)"
           style="color:#7ab4ff;font-size:12px;font-weight:700;background:none;border:none;cursor:pointer;padding:0;text-align:left;line-height:1.3"
           onmouseover="this.style.textDecoration='underline';${SV_MAP_GROUPS.has(gameGroup) ? 'showSvMapTooltip(this,this.dataset.loc,this.dataset.area)' : ''}"
           onmouseout="this.style.textDecoration='none'">${enc.location_name}<span class="loc-count" style="color:#546070;font-size:10px;font-weight:400"></span></button>
        <div style="display:flex;align-items:center;gap:3px;flex-shrink:0">
          ${lvl  ? `<span style="background:#0a1020;color:#90a0b8;padding:1px 7px;border-radius:10px;font-size:10px;font-weight:600;white-space:nowrap">${lvl}</span>`  : ''}
          ${rate ? `<span style="background:#0e1f44;color:#7ab4ff;padding:1px 7px;border-radius:10px;font-size:10px;font-weight:700;white-space:nowrap">${rate}</span>` : ''}
        </div>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:6px">
        <div style="display:flex;flex-wrap:wrap;align-items:center;gap:3px">
          ${gameChips ? `${gameChips}<span style="color:#2a3a50;margin:0 2px">·</span>` : ''}
          <span style="background:#0e1c2e;color:#5a80a8;padding:1px 7px;border-radius:10px;font-size:10px;font-weight:600;white-space:nowrap;border:1px solid #1a2e48">${methodLabel}</span>
          ${tagHtml}
        </div>
        <a href="${url}" target="_blank" rel="noopener"
          style="flex-shrink:0;padding:1px 6px;border-radius:4px;border:1px solid #1e3a5f;background:#0a1830;color:#4a88cc;font-size:9px;font-weight:600;text-decoration:none;white-space:nowrap"
          onmouseover="this.style.borderColor='#3a6aaf'" onmouseout="this.style.borderColor='#1e3a5f'">Bulbapedia ↗</a>
      </div>
    </div>`;
  }

  let html;
  if (activeName) {
    const primary = encounters.filter(e => (e._games || [e.game_name]).includes(activeName));
    const rest    = encounters.filter(e => !(e._games || [e.game_name]).includes(activeName));
    html = primary.map(encCard).join('');
    if (primary.length && rest.length) html += `<div style="border-top:1px solid #182035;margin:8px 0 10px"></div>`;
    html += rest.map(encCard).join('');
  } else {
    html = encounters.map(encCard).join('');
  }
  return `<div style="margin-bottom:8px">${html}</div>`;
}

function renderFamilyOriginCard(origin, originGame) {
  const isBreed = origin.method === 'breed';
  const icon = isBreed
    ? '<i class="bi bi-egg-fill ei" style="color:#6db87a;font-size:13px"></i>'
    : '<i class="bi bi-arrow-up-right-circle-fill ei" style="color:#7ab4ff;font-size:13px"></i>';
  const label = isBreed ? 'Breed' : 'Evolve';
  const itemNote = origin.breed_item
    ? `<div style="font-size:10px;color:#7a8ea8;margin-top:3px">Hold <strong style="color:#e2a060">${origin.breed_item}</strong> when breeding</div>`
    : '';
  const game = originGame || origin.game || null;
  const gameNote = (game && game !== window.__LD.GAME_NAME)
    ? `<div style="font-size:10px;color:#7a8ea8;margin-top:3px">Only available in <strong style="color:${(window.__LD.GAME_COLORS||{})[game]||'#fac000'}">${game}</strong></div>`
    : '';
  return `<div style="background:linear-gradient(160deg,#0c1628,#091020);border:1px solid #182035;border-radius:8px;padding:10px 12px;display:flex;align-items:center;gap:10px">
    <img src="${origin.from.icon_url || ''}" width="44" height="44" style="object-fit:contain;flex-shrink:0">
    <div>
      <div style="font-size:12px;font-weight:700;color:#a0b4cc">${icon} ${label} from <span style="color:#c9d1d9">${origin.from.name}</span></div>
      ${itemNote}
      ${gameNote}
    </div>
  </div>`;
}

// Find the best family-origin for the current game, falling back to any sibling
// game in the same group (e.g. Scarlet falls back to a Violet ancestor).
// Returns { origin, game } or null.
function findActiveOrigin(data) {
  if (!data.family_origins || panelGameGroup !== window.__LD.GAME_GROUP || !window.__LD.GAME_NAME) return null;
  const exact = data.family_origins[window.__LD.GAME_NAME];
  if (exact) return { origin: exact, game: window.__LD.GAME_NAME };
  const siblingNames = (window.__LD.GAMES || [])
    .filter(g => g.game_group === window.__LD.GAME_GROUP)
    .map(g => g.name);
  for (const name of siblingNames) {
    if (data.family_origins[name]) return { origin: data.family_origins[name], game: name };
  }
  return null;
}

function renderEncounterSection(data, pokemonId) {
  const el = document.getElementById('encounter-section');
  if (!el || !selectedCard || selectedCard.dataset.pokemonId !== pokemonId) return;
  const allMegaStone = data.groups.length > 0 &&
    data.groups.every(g => g.encounters.every(e => e.encounter_method === 'mega-stone'));
  const sectionLabel = allMegaStone ? 'Mega Stone Locations' : 'Wild Locations';
  const title = `<div class="dp-section-title">${sectionLabel}</div>`;
  const unobtainable = `<div style="font-size:11px;color:#e05;background:#1a0008;border:1px solid #3a0015;border-radius:6px;padding:5px 9px;display:inline-block">Unobtainable</div>`;

  const originMatch = findActiveOrigin(data);

  if (!data.groups || !data.groups.length) {
    if (panelGameGroup) {
      el.innerHTML = title + (originMatch ? renderFamilyOriginCard(originMatch.origin, originMatch.game) : unobtainable);
    } else {
      el.innerHTML = title + '<div style="font-size:11px;color:#546070">No wild encounter data</div>';
    }
    return;
  }
  const groups = panelGameGroup
    ? data.groups.filter(g => g.game_group === panelGameGroup)
    : data.groups;
  const parts = [title];
  if (groups.length) {
    const activeName = (panelGameGroup === window.__LD.GAME_GROUP) ? window.__LD.GAME_NAME : null;
    const hideFS = !_friendSafariSelected();
    for (const group of groups) {
      let encs = group.encounters;
      let fsHidden = 0;
      if (hideFS && group.game_group === 'XY') {
        const before = encs.length;
        encs = encs.filter(e => !_isFriendSafari(e));
        fsHidden = before - encs.length;
      }
      const label = `<div class="enc-group-label">${group.label}</div>`;
      const note  = fsHidden
        ? `<div style="font-size:10px;color:#546070;padding:2px 2px 8px;line-height:1.4"><i class="bi bi-eye-slash" style="margin-right:4px;opacity:.7"></i>Friend Safari encounters hidden — select the <strong style="color:#7a9a7a">Friend Safari</strong> location to view them.</div>`
        : '';
      if (!encs.length) {            // group was entirely Friend Safari
        if (fsHidden) parts.push(label + note);
        continue;
      }
      const merged = mergeEncounters(encs);
      parts.push(label + renderEncounterTable(group.game_group, merged, activeName) + note);
    }
  } else {
    parts.push(originMatch ? renderFamilyOriginCard(originMatch.origin, originMatch.game) : unobtainable);
  }
  el.innerHTML = parts.join('');
  updateLocationCounts();
}

function renderPanelGameSelector(data) {
  const el = document.getElementById('panel-game-selector');
  if (!el) return;
  if (!data.groups || !data.groups.length) { el.innerHTML = ''; return; }
  const allActive = panelGameGroup === null;
  const allBtn = `<button onclick="setPanelGame(null)"
    style="padding:3px 9px;border-radius:4px;border:1px solid ${allActive?'#4a7fff':'#1c2333'};background:${allActive?'#1a3a8f':'#0c1628'};color:${allActive?'#a8c4ff':'#6b7a99'};font-size:11px;cursor:pointer;font-weight:${allActive?'600':'400'};white-space:nowrap;transition:background .1s,color .1s">All</button>`;
  const btns = data.groups.map(g => {
    const active = g.game_group === panelGameGroup;
    return `<button onclick="setPanelGame('${g.game_group}')"
      style="padding:3px 9px;border-radius:4px;border:1px solid ${active?'#4a7fff':'#1c2333'};background:${active?'#1a3a8f':'#0c1628'};color:${active?'#a8c4ff':'#6b7a99'};font-size:11px;cursor:pointer;font-weight:${active?'600':'400'};white-space:nowrap;transition:background .1s,color .1s">${g.label}</button>`;
  }).join('');
  el.innerHTML = `<div style="padding:6px 0 8px">
    <div style="font-size:10px;color:#4a5568;margin-bottom:6px;text-transform:uppercase;letter-spacing:.06em">View locations for</div>
    <div style="display:flex;flex-wrap:wrap;gap:4px">${allBtn}${btns}</div>
  </div>`;
}

function setPanelGame(gameGroup) {
  panelGameGroup = panelGameGroup === gameGroup ? null : gameGroup;
  if (panelEncData) {
    renderPanelGameSelector(panelEncData);
    if (selectedCard) renderEncounterSection(panelEncData, selectedCard.dataset.pokemonId);
  }
}
