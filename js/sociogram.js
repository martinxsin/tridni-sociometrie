/**
 * Interaktivní SVG sociogram vztahů:
 * - Orbitální rozložení (soustředné kruhy podle vlivu – nejvlivnější v centru)
 * - Silové (force-directed) rozložení (automaticky shlukuje přátelské kliky, uzly lze přetahovat)
 */
(function (root) {
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';

  const CLIQUE_PALETTE = [
    '#059669',
    '#2563eb',
    '#7c3aed',
    '#0891b2',
    '#db2777',
    '#ea580c',
  ];

  function el(tag, attrs = {}, text = null) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v !== undefined && v !== null) node.setAttribute(k, String(v));
    }
    if (text !== null) node.textContent = text;
    return node;
  }

  /**
   * Vypočítá orbitální souřadnice:
   * - Poloměr podle indexu vlivu (1 = střed, 5 = okraj)
   * - Úhel podle příslušnosti ke klikám (aby přátelé byli u sebe a čáry se méně křížily)
   */
  function computeOrbitalPositions(analysis, width, height) {
    const cx = width / 2;
    const cy = height / 2;
    const maxR = Math.min(width, height) * 0.41;
    const minR = Math.min(width, height) * 0.11;

    // Přiřadit každého žáka k primární klice pro logické pořadí po obvodu
    const primaryClique = new Map();
    analysis.cliques.groups.forEach((group, idx) => {
      group.forEach((id) => {
        if (!primaryClique.has(id)) primaryClique.set(id, idx);
      });
    });

    const ordered = [...analysis.students].sort((a, b) => {
      const ca = primaryClique.has(a.student.id) ? primaryClique.get(a.student.id) : 999;
      const cb = primaryClique.has(b.student.id) ? primaryClique.get(b.student.id) : 999;
      if (ca !== cb) return ca - cb;
      const sa = a.sympathyIndex ?? 3;
      const sb = b.sympathyIndex ?? 3;
      return sa - sb;
    });

    const positions = new Map();
    const count = ordered.length;

    ordered.forEach((item, idx) => {
      const angle = (idx / Math.max(1, count)) * Math.PI * 2 - Math.PI / 2;
      const inf = item.influenceIndex !== null ? item.influenceIndex : 3.0;
      const norm = Math.max(0, Math.min(1, (inf - 1) / 4));
      const r = minR + norm * (maxR - minR);
      positions.set(item.student.id, {
        x: cx + Math.cos(angle) * r,
        y: cy + Math.sin(angle) * r,
      });
    });

    return { positions, cx, cy, minR, maxR };
  }

  /**
   * Deterministický force-directed algoritmus (Fruchterman-Reingold s váhami podle sympatií).
   */
  function computeForcePositions(analysis, width, height) {
    const cx = width / 2;
    const cy = height / 2;
    const students = analysis.students;
    const n = students.length;
    const pad = 54;

    // Počáteční pozice na kruhu (deterministické)
    const nodes = students.map((item, idx) => {
      const angle = (idx / Math.max(1, n)) * Math.PI * 2;
      const r = Math.min(width, height) * 0.32;
      return {
        id: item.student.id,
        x: cx + Math.cos(angle) * r,
        y: cy + Math.sin(angle) * r,
        dx: 0,
        dy: 0,
      };
    });

    const nodeMap = new Map(nodes.map((nd) => [nd.id, nd]));
    const area = (width - 2 * pad) * (height - 2 * pad);
    const k = Math.sqrt(area / Math.max(1, n)) * 0.85;

    const attractiveEdges = analysis.edges.filter(
      (e) => e.type === 'mutual_sympathy' || e.type === 'unilateral_sympathy'
    );
    const repulsiveEdges = analysis.edges.filter((e) => e.type === 'mutual_antipathy');

    const iterations = 160;
    let temp = Math.min(width, height) * 0.14;

    for (let iter = 0; iter < iterations; iter++) {
      for (const v of nodes) {
        v.dx = 0;
        v.dy = 0;
      }

      // Odpudivá síla mezi všemi uzly
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const u = nodes[i];
          const v = nodes[j];
          let dx = u.x - v.x;
          let dy = u.y - v.y;
          let dist = Math.hypot(dx, dy) || 0.01;
          const force = (k * k) / dist;
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          u.dx += fx;
          u.dy += fy;
          v.dx -= fx;
          v.dy -= fy;
        }
      }

      // Přitažlivá síla pro sympatie (vzájemné mnohem silnější -> tvoří kliky)
      for (const edge of attractiveEdges) {
        const u = nodeMap.get(edge.source);
        const v = nodeMap.get(edge.target);
        if (!u || !v) continue;
        const dx = u.x - v.x;
        const dy = u.y - v.y;
        const dist = Math.hypot(dx, dy) || 0.01;
        const weight =
          edge.type === 'mutual_sympathy'
            ? edge.strength === 'strong'
              ? 2.2
              : 1.4
            : 0.25;
        const force = ((dist * dist) / k) * weight;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        u.dx -= fx;
        u.dy -= fy;
        v.dx += fx;
        v.dy += fy;
      }

      // Extra odpuzování pro vzájemné antipatie
      for (const edge of repulsiveEdges) {
        const u = nodeMap.get(edge.source);
        const v = nodeMap.get(edge.target);
        if (!u || !v) continue;
        const dx = u.x - v.x;
        const dy = u.y - v.y;
        const dist = Math.hypot(dx, dy) || 0.01;
        const force = (k * k * 0.8) / dist;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        u.dx += fx;
        u.dy += fy;
        v.dx -= fx;
        v.dy -= fy;
      }

      // Jemná gravitace ke středu (aby izolovaní neodletěli úplně pryč)
      for (const v of nodes) {
        v.dx += (cx - v.x) * 0.06;
        v.dy += (cy - v.y) * 0.06;

        const disp = Math.hypot(v.dx, v.dy) || 0.01;
        v.x += (v.dx / disp) * Math.min(disp, temp);
        v.y += (v.dy / disp) * Math.min(disp, temp);

        v.x = Math.max(pad, Math.min(width - pad, v.x));
        v.y = Math.max(pad, Math.min(height - pad, v.y));
      }

      temp *= 0.965;
    }

    const positions = new Map(nodes.map((nd) => [nd.id, { x: nd.x, y: nd.y }]));
    return { positions, cx, cy };
  }

  /**
   * Hlavní renderer sociogramu.
   */
  function renderSociogram(container, analysis, options = {}) {
    container.innerHTML = '';

    const students = analysis.students || [];
    if (students.length < 2) {
      container.innerHTML =
        '<div style="padding:28px;text-align:center;color:#64748b;font-size:0.9rem;">Pro vykreslení sociogramu zadejte alespoň 2 žáky a jejich hodnocení.</div>';
      return null;
    }

    const width = options.width || 660;
    const height = options.height || 520;
    const layout = options.layout || 'orbital';
    const filters = options.filters || {
      mutualSym: true,
      uniSym: false,
      mutualAnti: true,
      uniAnti: false,
    };
    const focusedId = options.focusedId || null;

    const layoutResult =
      layout === 'force'
        ? computeForcePositions(analysis, width, height)
        : computeOrbitalPositions(analysis, width, height);

    // Pokud uživatel v silovém režimu uzly přetáhl, přebíráme uložené pozice
    const positions = layoutResult.positions;
    if (layout === 'force' && options.customPositions) {
      for (const [id, pos] of options.customPositions.entries()) {
        if (positions.has(id)) positions.set(id, { ...pos });
      }
    }

    const svg = el('svg', {
      viewBox: `0 0 ${width} ${height}`,
      xmlns: SVG_NS,
      role: 'img',
      'aria-label': 'Interaktivní sociogram vztahů',
    });

    // Definice šipek pro jednostranné vazby
    const defs = el('defs');
    defs.appendChild(createArrowMarker('arrow-uni-sym', '#3b82f6'));
    defs.appendChild(createArrowMarker('arrow-uni-anti', '#f59e0b'));
    svg.appendChild(defs);

    // Bílé pozadí
    svg.appendChild(el('rect', { x: 0, y: 0, width, height, fill: '#ffffff' }));

    // Orbitální soustředné kruhy (v orbitálním režimu)
    if (layout === 'orbital') {
      const { cx, cy, minR, maxR } = layoutResult;
      const rings = [
        { val: 2, label: 'Vliv 2 (střed)' },
        { val: 3, label: 'Vliv 3' },
        { val: 4, label: 'Vliv 4' },
        { val: 5, label: 'Vliv 5 (okraj)' },
      ];
      rings.forEach((ring) => {
        const r = minR + ((ring.val - 1) / 4) * (maxR - minR);
        svg.appendChild(
          el('circle', {
            cx,
            cy,
            r,
            fill: 'none',
            stroke: '#e2e8f0',
            'stroke-width': 1,
            'stroke-dasharray': '4,4',
          })
        );
        svg.appendChild(
          el(
            'text',
            {
              x: cx + 4,
              y: cy - r + 12,
              'font-size': 10,
              fill: '#94a3b8',
              'font-family': 'system-ui, sans-serif',
            },
            ring.label
          )
        );
      });
    }

    // Vrstva pro hrany a vrstva pro uzly
    const edgeLayer = el('g', { class: 'socio-edges' });
    const nodeLayer = el('g', { class: 'socio-nodes' });
    svg.appendChild(edgeLayer);
    svg.appendChild(nodeLayer);

    // Zjištění aktivních hran podle filtrů
    const visibleEdges = analysis.edges.filter((e) => {
      if (e.type === 'mutual_sympathy') return filters.mutualSym;
      if (e.type === 'unilateral_sympathy') return filters.uniSym;
      if (e.type === 'mutual_antipathy') return filters.mutualAnti;
      if (e.type === 'unilateral_antipathy') return filters.uniAnti;
      return false;
    });

    // Sousedé vybraného žáka (pro zvýraznění při kliknutí)
    const connectedToFocus = new Set();
    if (focusedId) {
      connectedToFocus.add(focusedId);
      visibleEdges.forEach((e) => {
        if (e.source === focusedId) connectedToFocus.add(e.target);
        if (e.target === focusedId) connectedToFocus.add(e.source);
      });
    }

    const edgeElements = [];

    function updateEdgeGeometry(edgeObj) {
      const p1 = positions.get(edgeObj.edge.source);
      const p2 = positions.get(edgeObj.edge.target);
      if (!p1 || !p2) return;

      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const dist = Math.hypot(dx, dy) || 1;
      const ux = dx / dist;
      const uy = dy / dist;

      const rStart = 18;
      const rEnd = edgeObj.directed ? 22 : 18;
      const x1 = p1.x + ux * rStart;
      const y1 = p1.y + uy * rStart;
      const x2 = p2.x - ux * rEnd;
      const y2 = p2.y - uy * rEnd;

      if (edgeObj.directed) {
        // Mírné zakřivení pro jednostranné šipky, aby se nepřekrývaly
        const mx = (x1 + x2) / 2 - uy * 14;
        const my = (y1 + y2) / 2 + ux * 14;
        edgeObj.el.setAttribute('d', `M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}`);
      } else {
        edgeObj.el.setAttribute('x1', x1);
        edgeObj.el.setAttribute('y1', y1);
        edgeObj.el.setAttribute('x2', x2);
        edgeObj.el.setAttribute('y2', y2);
      }
    }

    // Vykreslení hran
    for (const edge of visibleEdges) {
      const isFocusedEdge =
        !focusedId || edge.source === focusedId || edge.target === focusedId;
      const baseOpacity = isFocusedEdge ? 0.85 : 0.08;

      let lineEl;
      let directed = false;

      if (edge.type === 'mutual_sympathy') {
        lineEl = el('line', {
          stroke: edge.strength === 'strong' ? '#047857' : '#10b981',
          'stroke-width': edge.strength === 'strong' ? 3 : 1.9,
          opacity: baseOpacity,
        });
      } else if (edge.type === 'mutual_antipathy') {
        lineEl = el('line', {
          stroke: '#dc2626',
          'stroke-width': edge.strength === 'strong' ? 2.6 : 1.8,
          'stroke-dasharray': '6,4',
          opacity: baseOpacity,
        });
      } else if (edge.type === 'unilateral_sympathy') {
        directed = true;
        lineEl = el('path', {
          fill: 'none',
          stroke: '#3b82f6',
          'stroke-width': 1.3,
          'marker-end': 'url(#arrow-uni-sym)',
          opacity: isFocusedEdge ? 0.55 : 0.05,
        });
      } else {
        directed = true;
        lineEl = el('path', {
          fill: 'none',
          stroke: '#f59e0b',
          'stroke-width': 1.3,
          'stroke-dasharray': '3,3',
          'marker-end': 'url(#arrow-uni-anti)',
          opacity: isFocusedEdge ? 0.55 : 0.05,
        });
      }

      const obj = { edge, el: lineEl, directed };
      updateEdgeGeometry(obj);
      edgeLayer.appendChild(lineEl);
      edgeElements.push(obj);
    }

    // Vykreslení uzlů žáků
    for (const item of students) {
      const pos = positions.get(item.student.id);
      if (!pos) continue;

      const isDimmed = focusedId && !connectedToFocus.has(item.student.id);
      const isSelected = focusedId === item.student.id;

      const g = el('g', {
        transform: `translate(${pos.x}, ${pos.y})`,
        style: layout === 'force' ? 'cursor:grab;' : 'cursor:pointer;',
        opacity: isDimmed ? 0.22 : 1,
      });

      const fill = item.quadrant.color;
      const radius = isSelected ? 19 : 16;

      if (isSelected) {
        g.appendChild(
          el('circle', {
            cx: 0,
            cy: 0,
            r: radius + 5,
            fill: 'none',
            stroke: '#1d4ed8',
            'stroke-width': 2.5,
            'stroke-dasharray': '4,2',
          })
        );
      }

      if (item.student.gender === 'M') {
        g.appendChild(
          el('rect', {
            x: -radius,
            y: -radius,
            width: radius * 2,
            height: radius * 2,
            rx: 5,
            fill,
            stroke: '#ffffff',
            'stroke-width': 2.2,
          })
        );
      } else {
        g.appendChild(
          el('circle', {
            cx: 0,
            cy: 0,
            r: radius,
            fill,
            stroke: '#ffffff',
            'stroke-width': 2.2,
          })
        );
      }

      // Kód uvnitř uzlu
      g.appendChild(
        el(
          'text',
          {
            x: 0,
            y: 4,
            'text-anchor': 'middle',
            'font-size': 10,
            'font-weight': 700,
            fill: '#ffffff',
            'font-family': 'system-ui, sans-serif',
            'pointer-events': 'none',
          },
          item.student.code
        )
      );

      // Jméno pod uzlem (respektuje anonymní režim)
      const labelText = options.getLabel ? options.getLabel(item.student, false) : '';
      if (labelText && labelText !== item.student.code) {
        g.appendChild(
          el(
            'text',
            {
              x: 0,
              y: radius + 13,
              'text-anchor': 'middle',
              'font-size': 10.5,
              'font-weight': 600,
              fill: '#0f172a',
              'font-family': 'system-ui, sans-serif',
              'pointer-events': 'none',
              style:
                'paint-order:stroke;stroke:#ffffff;stroke-width:3px;stroke-linejoin:round;',
            },
            labelText
          )
        );
      }

      if (options.onHover) {
        g.addEventListener('mouseenter', (ev) => options.onHover(ev, item));
        g.addEventListener('mousemove', (ev) => options.onHover(ev, item));
        g.addEventListener('mouseleave', () => options.onLeave && options.onLeave());
      }

      // Interakce: kliknutí pro fokus, v silovém režimu navíc přetahování
      let dragged = false;
      if (layout === 'force' && !options.staticMode) {
        g.addEventListener('pointerdown', (ev) => {
          ev.preventDefault();
          dragged = false;
          g.setPointerCapture(ev.pointerId);
          g.style.cursor = 'grabbing';

          const startClientX = ev.clientX;
          const startClientY = ev.clientY;
          const rect = svg.getBoundingClientRect();
          const scaleX = width / rect.width;
          const scaleY = height / rect.height;

          const onMove = (moveEv) => {
            if (
              Math.abs(moveEv.clientX - startClientX) > 3 ||
              Math.abs(moveEv.clientY - startClientY) > 3
            ) {
              dragged = true;
            }
            const nx = Math.max(
              24,
              Math.min(width - 24, (moveEv.clientX - rect.left) * scaleX)
            );
            const ny = Math.max(
              24,
              Math.min(height - 24, (moveEv.clientY - rect.top) * scaleY)
            );
            positions.set(item.student.id, { x: nx, y: ny });
            if (options.customPositions) {
              options.customPositions.set(item.student.id, { x: nx, y: ny });
            }
            g.setAttribute('transform', `translate(${nx}, ${ny})`);
            for (const eo of edgeElements) {
              if (
                eo.edge.source === item.student.id ||
                eo.edge.target === item.student.id
              ) {
                updateEdgeGeometry(eo);
              }
            }
          };

          const onUp = () => {
            g.style.cursor = 'grab';
            g.removeEventListener('pointermove', onMove);
            g.removeEventListener('pointerup', onUp);
            if (!dragged && options.onFocusToggle) {
              options.onFocusToggle(item.student.id);
            }
          };

          g.addEventListener('pointermove', onMove);
          g.addEventListener('pointerup', onUp);
        });
      } else if (options.onFocusToggle) {
        g.addEventListener('click', () => options.onFocusToggle(item.student.id));
      }

      // Dvojklik otevře detailní kartu žáka
      if (options.onOpenDetail) {
        g.addEventListener('dblclick', () => options.onOpenDetail(item.student.id));
      }

      nodeLayer.appendChild(g);
    }

    // Legenda v dolní liště SVG
    const legendY = height - 14;
    const legendItems = [
      { color: '#059669', text: '● Vůdčí & oblíbený' },
      { color: '#d97706', text: '● Vlivný & neoblíbený' },
      { color: '#2563eb', text: '● Oblíbený' },
      { color: '#dc2626', text: '● Ohrožený / izolovaný' },
    ];
    legendItems.forEach((li, i) => {
      svg.appendChild(
        el(
          'text',
          {
            x: 16 + i * 160,
            y: legendY,
            'font-size': 10.5,
            'font-weight': 600,
            fill: li.color,
            'font-family': 'system-ui, sans-serif',
          },
          li.text
        )
      );
    });

    container.appendChild(svg);
    return svg;
  }

  function createArrowMarker(id, color) {
    const marker = el('marker', {
      id,
      viewBox: '0 0 10 10',
      refX: 8,
      refY: 5,
      markerWidth: 6,
      markerHeight: 6,
      orient: 'auto-start-reverse',
    });
    marker.appendChild(el('path', { d: 'M 0 1 L 10 5 L 0 9 z', fill: color }));
    return marker;
  }

  root.SocioGraph = {
    CLIQUE_PALETTE,
    renderSociogram,
  };
})(typeof self !== 'undefined' ? self : this);
