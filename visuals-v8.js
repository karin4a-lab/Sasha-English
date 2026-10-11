/* Simple spatial scenes are drawn locally; future words fall back to their icon. */
const Visuals = (() => {
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ball = (x, y, r = 20) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#fbbf24" stroke="#b45309" stroke-width="2.5"/><path d="M${x-r*.5},${y-r*.4}q${r*.35},-${r*.4} ${r*.7},-${r*.35}" fill="none" stroke="#fff8dc" stroke-width="4" stroke-linecap="round"/>`;
  const box = (x, y, w = 80, h = 65) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="#a5b4fc" stroke="#4f46e5" stroke-width="2.5"/><path d="M${x+10},${y+12}h${w-20}" stroke="#c7d2fe" stroke-width="8" stroke-linecap="round"/>`;
  const table = y => `<path d="M78,${y+10}v${140-y-10}M182,${y+10}v${140-y-10}" stroke="#4f46e5" stroke-width="10" stroke-linecap="round"/><rect x="60" y="${y}" width="140" height="12" rx="5" fill="#a5b4fc" stroke="#4f46e5" stroke-width="2.5"/>`;
  function scene(en) {
    switch (en) {
      case 'next to': return box(147, 64, 68, 73) + ball(111, 115);
      case 'by': return box(147, 64, 68, 73) + ball(87, 115);
      case 'between': return box(24, 69, 64, 68) + box(172, 69, 64, 68) + ball(130, 113);
      case 'on': return table(80) + ball(130, 59);
      case 'under': return table(57) + ball(130, 119, 18);
      case 'over': return box(86, 98, 88, 40) + ball(130, 35);
      case 'behind': return ball(130, 65, 27) + box(83, 74, 94, 64);
      case 'in front of': return box(86, 49, 88, 86) + ball(130, 120, 25);
      case 'in': return `<path d="M81,77l49,-19 49,19v60H81z" fill="#c7d2fe" stroke="#4f46e5" stroke-width="2.5"/><path d="M81,77l49,19 49,-19" fill="none" stroke="#4f46e5" stroke-width="2.5"/>` + ball(130, 86, 20) + `<path d="M81,91l49,19 49,-19v46H81z" fill="#a5b4fc" stroke="#4f46e5" stroke-width="2.5"/>`;
      default: return '';
    }
  }
  function word(w) {
    const drawing = w.visual === false ? '' : scene(w.visual || w.en);
    if (!drawing) return `<span class="word-icon" aria-hidden="true">${esc(w.icon || '🔤')}</span>`;
    return `<svg viewBox="0 0 260 160" role="img" aria-label="${esc(w.ru)}"><rect x="4" y="4" width="252" height="152" rx="24" fill="#eef2ff"/><path d="M24,140H236" stroke="#d8def4" stroke-width="3" stroke-linecap="round"/>${drawing}</svg>`;
  }
  return { word };
})();
