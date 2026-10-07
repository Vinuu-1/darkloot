(() => {
  function renderEventsChart(target, input = []) {
    if (!target) return;
    const days = Array.isArray(input) ? input.slice(-7) : [];
    const width = 860, height = 260, left = 48, right = 16, top = 18, bottom = 40;
    const chartWidth = width - left - right, chartHeight = height - top - bottom;
    const rows = days.map((item) => ({
      day: /^\d{4}-\d{2}-\d{2}$/.test(String(item.day)) ? String(item.day) : '',
      views: Math.max(0, Number(item.views) || 0),
      downloads: Math.max(0, Number(item.downloads) || 0)
    }));
    while (rows.length < 7) rows.unshift({ day: '', views: 0, downloads: 0 });
    const max = Math.max(1, ...rows.flatMap((item) => [item.views, item.downloads]));
    const x = (index) => left + (rows.length <= 1 ? chartWidth / 2 : index * chartWidth / (rows.length - 1));
    const y = (value) => top + chartHeight - (value / max) * chartHeight;
    const polyline = (key) => rows.map((item, index) => `${x(index)},${y(item[key])}`).join(' ');
    const grid = Array.from({ length: 4 }, (_, index) => {
      const value = Math.round(max * (3 - index) / 3);
      const lineY = top + index * chartHeight / 3;
      return `<g class="chart-grid-line"><line x1="${left}" y1="${lineY}" x2="${width - right}" y2="${lineY}"/><text x="${left - 10}" y="${lineY + 4}" text-anchor="end">${value}</text></g>`;
    }).join('');
    const points = (key, className) => rows.map((item, index) => `<circle class="chart-point ${className}" cx="${x(index)}" cy="${y(item[key])}" r="3.5"><title>${item[key]} ${key} on ${item.day || 'no activity'}</title></circle>`).join('');
    const labels = rows.map((item, index) => {
      const label = item.day ? new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(new Date(`${item.day}T00:00:00Z`)) : '—';
      return `<text class="chart-day" x="${x(index)}" y="${height - 12}" text-anchor="middle">${label}</text>`;
    }).join('');
    target.innerHTML = `<svg class="events-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Wallpaper views and downloads during the last seven days">${grid}<polyline class="chart-line chart-line-views" points="${polyline('views')}" pathLength="1"/> <polyline class="chart-line chart-line-downloads" points="${polyline('downloads')}" pathLength="1"/>${points('views', 'chart-point-views')}${points('downloads', 'chart-point-downloads')}${labels}</svg>`;
  }
  window.VinuCharts = { renderEventsChart };
})();
