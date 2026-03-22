/* ============================================================
   script.js — Portafolio cromo & topografía
   Módulos: topo, cursor, sidebar, reveal, coordenadas
   ============================================================ */

'use strict';

/* ── 1. FONDO TOPOGRÁFICO ────────────────────────────────── */
function generateTopo() {
  const container = document.getElementById('topoBg');
  if (!container) return;

  const W = window.innerWidth;
  const H = window.innerHeight * 4;
  const ns = 'http://www.w3.org/2000/svg';

  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  svg.setAttribute('preserveAspectRatio', 'xMidYMid slice');
  svg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;';

  // Ruido de campo con funciones trigonométricas superpuestas
  function noise(x, y, seed) {
    return (
      Math.cos(x * 0.008 + seed) +
      Math.sin(y * 0.006 + seed * 1.3) +
      Math.cos((x + y) * 0.005 + seed * 0.7) +
      Math.sin(x * 0.003 - y * 0.004 + seed * 2.1)
    ) * 0.25;
  }

  function getVal(x, y) {
    return noise(x, y, 3.7) + noise(x * 2, y * 2, 1.2) * 0.4;
  }

  // Interpolación lineal entre dos puntos en el borde de una celda
  function lerp(a, b, va, vb, threshold) {
    return a + (b - a) * (threshold - va) / (vb - va);
  }

  const GRID  = 18;
  const COLS  = Math.ceil(W / GRID) + 1;
  const ROWS  = Math.ceil(H / GRID) + 1;
  const MIN_V = -0.7;
  const MAX_V =  0.7;
  const LEVELS = 28;

  const COLORS = [
    'rgba(200,196,190,0.22)',
    'rgba(170,166,160,0.18)',
    'rgba(140,136,130,0.15)',
    'rgba(110,106,100,0.12)',
    'rgba(184,160,96,0.10)',
  ];

  // Pre-calcula grid de valores de campo escalar
  const grid = [];
  for (let r = 0; r <= ROWS; r++) {
    grid[r] = [];
    for (let c = 0; c <= COLS; c++) {
      grid[r][c] = getVal(c * GRID, r * GRID);
    }
  }

  // Tabla de segmentos por caso de marching squares (16 casos)
  // Cada entrada: índices de qué bordes intersectan el umbral
  // Bordes: 0=top, 1=right, 2=bottom, 3=left
  const CASE_EDGES = {
    1:  [[2, 1]], 2:  [[3, 2]], 3:  [[3, 1]],
    4:  [[0, 1]], 5:  [[0, 2]], 6:  [[0, 1],[3, 2]],
    7:  [[3, 0]], 8:  [[3, 0]], 9:  [[0, 1],[3, 2]],
    10: [[0, 2]], 11: [[0, 1]], 12: [[3, 1]],
    13: [[3, 2]], 14: [[2, 1]],
  };

  for (let li = 0; li < LEVELS; li++) {
    const threshold = MIN_V + (MAX_V - MIN_V) * (li / LEVELS);
    const isMajor   = li % 5 === 0;
    const strokeW   = isMajor ? 0.7 : 0.3;
    const colorIdx  = Math.min(Math.floor(li / 6), COLORS.length - 1);
    const color     = isMajor
      ? (li % 15 === 0 ? 'rgba(184,160,96,0.28)' : 'rgba(190,186,180,0.28)')
      : COLORS[colorIdx];

    let pathD = '';

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const v00 = grid[r][c];
        const v10 = (grid[r][c + 1]        !== undefined) ? grid[r][c + 1]        : v00;
        const v01 = (grid[r + 1]           !== undefined) ? grid[r + 1][c]        : v00;
        const v11 = (grid[r + 1] && grid[r + 1][c + 1] !== undefined) ? grid[r + 1][c + 1] : v00;

        const x0 = c * GRID, y0 = r * GRID;
        const x1 = x0 + GRID, y1 = y0 + GRID;

        const above = [
          v00 > threshold,  // TL
          v10 > threshold,  // TR
          v01 > threshold,  // BL
          v11 > threshold,  // BR
        ];

        const caseIdx = (above[0] ? 8 : 0) | (above[1] ? 4 : 0) |
                        (above[2] ? 2 : 0) | (above[3] ? 1 : 0);

        if (caseIdx === 0 || caseIdx === 15) continue;

        // Punto en cada borde (interpolado)
        const edgePts = [
          { x: lerp(x0, x1, v00, v10, threshold), y: y0 }, // top
          { x: x1, y: lerp(y0, y1, v10, v11, threshold) }, // right
          { x: lerp(x0, x1, v01, v11, threshold), y: y1 }, // bottom
          { x: x0, y: lerp(y0, y1, v00, v01, threshold) }, // left
        ];

        const segs = CASE_EDGES[caseIdx];
        if (!segs) continue;

        for (const [a, b] of segs) {
          const p1 = edgePts[a], p2 = edgePts[b];
          pathD += `M${p1.x.toFixed(1)},${p1.y.toFixed(1)} L${p2.x.toFixed(1)},${p2.y.toFixed(1)} `;
        }
      }
    }

    if (!pathD) continue;

    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', pathD);
    path.setAttribute('stroke', color);
    path.setAttribute('stroke-width', strokeW);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke-linecap', 'round');
    svg.appendChild(path);
  }

  container.appendChild(svg);
}

/* ── 2. CURSOR PERSONALIZADO ─────────────────────────────── */
function initCursor() {
  const cursor = document.getElementById('cursor');
  const ring   = document.getElementById('cursorRing');
  if (!cursor || !ring) return;

  let mx = 0, my = 0, rx = 0, ry = 0;

  document.addEventListener('mousemove', e => {
    mx = e.clientX;
    my = e.clientY;
    cursor.style.left = mx + 'px';
    cursor.style.top  = my + 'px';
  });

  // El anillo sigue al cursor con inercia
  (function animRing() {
    rx += (mx - rx) * 0.1;
    ry += (my - ry) * 0.1;
    ring.style.left = rx + 'px';
    ring.style.top  = ry + 'px';
    requestAnimationFrame(animRing);
  })();

  // Hover en elementos interactivos
  document.querySelectorAll('a, button, .sidebar-dot').forEach(el => {
    el.addEventListener('mouseenter', () => {
      cursor.classList.add('hover');
      ring.classList.add('hover');
    });
    el.addEventListener('mouseleave', () => {
      cursor.classList.remove('hover');
      ring.classList.remove('hover');
    });
  });
}

/* ── 3. SIDEBAR DE NAVEGACIÓN ────────────────────────────── */
function initSidebar() {
  const dots   = document.querySelectorAll('.sidebar-dot');
  const secIds = ['hero', 'about', 'projects', 'contact'];

  // Clic navega a la sección
  dots.forEach(dot => {
    dot.addEventListener('click', () => {
      const target = document.getElementById(dot.dataset.target);
      if (target) target.scrollIntoView({ behavior: 'smooth' });
    });
  });

  // IntersectionObserver marca el dot activo
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        dots.forEach(d => {
          d.classList.toggle('active', d.dataset.target === entry.target.id);
        });
      }
    });
  }, { threshold: 0.45 });

  secIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) observer.observe(el);
  });
}

/* ── 4. ANIMACIONES DE REVEAL ────────────────────────────── */
function initReveal() {
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
      }
    });
  }, { threshold: 0.12 });

  document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
}

/* ── 5. COORDENADAS DINÁMICAS ────────────────────────────── */
function initCoords() {
  const coord = document.getElementById('navCoord');
  if (!coord) return;

  document.addEventListener('mousemove', e => {
    const lat = (20.67 + (e.clientY / window.innerHeight - 0.5) * 0.04).toFixed(4);
    const lng = (103.37 + (e.clientX / window.innerWidth  - 0.5) * 0.04).toFixed(4);
    coord.textContent = `${lat}°N · ${lng}°W`;
  });
}

/* ── INIT ────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  generateTopo();
  initCursor();
  initSidebar();
  initReveal();
  initCoords();
});