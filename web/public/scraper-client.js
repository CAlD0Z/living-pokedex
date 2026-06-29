// Scraper progress wheels: connects to the SSE stream and animates SVG rings
// in the sidebar for each game-group scraper.
(function () {
  const CIRC = +(2 * Math.PI * 8).toFixed(2);

  function updateSidebarWheel(group, s) {
    const arc = document.getElementById('ssw-' + group);
    if (!arc) return;
    const wrap = document.getElementById('ssw-wrap-' + group);
    const isRunning = s.status === 'running';
    if (wrap) wrap.style.display = isRunning ? 'flex' : 'none';
    const svg = arc.parentElement;
    if (svg) svg.classList.toggle('ssw-spinning', isRunning);
    const pct = s.total > 0 ? s.done / s.total : 0;
    arc.style.strokeDashoffset = (CIRC * (1 - pct)).toFixed(2);
    arc.style.stroke = isRunning ? '#4a7fff' : s.status === 'error' ? '#f05060' : '#1a2a48';
  }

  const es = new EventSource('/api/scraper-events');
  es.onmessage = ev => {
    const d = JSON.parse(ev.data);
    if (d.type === 'init') {
      Object.entries(d.progress).forEach(([g, state]) => updateSidebarWheel(g, state));
    } else if (d.type === 'progress') {
      updateSidebarWheel(d.gameGroup, d);
    }
  };
})();
