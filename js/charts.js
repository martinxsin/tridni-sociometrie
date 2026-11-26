/**
 * Interaktivní 2D poziční graf (Vliv × Obliba) + pomocné funkce pro export SVG do SVG/PNG.
 */
(function (root) {
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';

  function el(tag, attrs = {}, text = null) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v !== undefined && v !== null) node.setAttribute(k, String(v));
    }
    if (text !== null) node.textContent = text;
    return node;
  }

  /**
   * Vykreslí 2D poziční graf Vliv (osa X: 5 -> 1) × Obliba (osa Y: 5 -> 1).
   * Vpravo nahoře jsou žáci s největším vlivem (1) a nejvyšší oblibou (1).
   */
  function renderScatterChart(container, analysis, options = {}) {
    container.innerHTML = '';

    const students = (analysis.students || []).filter(
      (s) => s.influenceIndex !== null && s.sympathyIndex !== null
    );

    if (students.length === 0) {
      container.innerHTML =
        '<div style="padding:28px;text-align:center;color:#64748b;font-size:0.9rem;">Zatím nejsou zadána dostatečná data pro zobrazení pozičního grafu.</div>';
      return null;
    }

    const width = options.width || 620;
    const height = options.height || 480;
    const pad = { top: 40, right: 32, bottom: 54, left: 58 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;

    // Mapování 5 (vlevo/dole) -> 1 (vpravo/nahoře)
    const xScale = (val) => pad.left + ((5 - val) / 4) * plotW;
    const yScale = (val) => pad.top + ((val - 1) / 4) * plotH;

    const svg = el('svg', {
      viewBox: `0 0 ${width} ${height}`,
      xmlns: SVG_NS,
      role: 'img',
      'aria-label': 'Poziční graf Vliv a Obliba',
    });

    // Bílé pozadí pro čistý export
    svg.appendChild(el('rect', { x: 0, y: 0, width, height, fill: '#ffffff' }));

    const tx = xScale(analysis.thresholds.influence);
    const ty = yScale(analysis.thresholds.sympathy);

    // 4 jemně podbarvené kvadranty
    // Vpravo nahoře: Vůdčí a oblíbení (high inf, high sym)
    svg.appendChild(
      el('rect', {
        x: tx,
        y: pad.top,
        width: Math.max(0, pad.left + plotW - tx),
        height: Math.max(0, ty - pad.top),
        fill: '#ecfdf5',
        opacity: 0.72,
      })
    );
    // Vpravo dole: Vlivní, ale neoblíbení (high inf, low sym)
    svg.appendChild(
      el('rect', {
        x: tx,
        y: ty,
        width: Math.max(0, pad.left + plotW - tx),
        height: Math.max(0, pad.top + plotH - ty),
        fill: '#fffbeb',
        opacity: 0.85,
      })
    );
    // Vlevo nahoře: Oblíbení, menší vliv (low inf, high sym)
    svg.appendChild(
      el('rect', {
        x: pad.left,
        y: pad.top,
        width: Math.max(0, tx - pad.left),
        height: Math.max(0, ty - pad.top),
        fill: '#eff6ff',
        opacity: 0.75,
      })
    );
    // Vlevo dole: Izolovaní / ohrožení (low inf, low sym)
    svg.appendChild(
      el('rect', {
        x: pad.left,
        y: ty,
        width: Math.max(0, tx - pad.left),
        height: Math.max(0, pad.top + plotH - ty),
        fill: '#fef2f2',
        opacity: 0.85,
      })
    );

    // Mřížka (1..5)
    for (let v = 1; v <= 5; v++) {
      const x = xScale(v);
      const y = yScale(v);
      svg.appendChild(
        el('line', {
          x1: x,
          y1: pad.top,
          x2: x,
          y2: pad.top + plotH,
          stroke: '#cbd5e1',
          'stroke-width': 1,
          'stroke-dasharray': v === 3 ? 'none' : '3,3',
          opacity: 0.6,
        })
      );
      svg.appendChild(
        el('line', {
          x1: pad.left,
          y1: y,
          x2: pad.left + plotW,
          y2: y,
          stroke: '#cbd5e1',
          'stroke-width': 1,
          'stroke-dasharray': v === 3 ? 'none' : '3,3',
          opacity: 0.6,
        })
      );

      // Popisky os
      svg.appendChild(
        el(
          'text',
          {
            x,
            y: pad.top + plotH + 18,
            'text-anchor': 'middle',
            'font-size': 11,
            fill: '#475569',
            'font-family': 'system-ui, sans-serif',
          },
          String(v)
        )
      );
      svg.appendChild(
        el(
          'text',
          {
            x: pad.left - 10,
            y: y + 4,
            'text-anchor': 'end',
            'font-size': 11,
            fill: '#475569',
            'font-family': 'system-ui, sans-serif',
          },
          String(v)
        )
      );
    }

    // Dělicí čáry prahů
    svg.appendChild(
      el('line', {
        x1: tx,
        y1: pad.top,
        x2: tx,
        y2: pad.top + plotH,
        stroke: '#475569',
        'stroke-width': 1.4,
        'stroke-dasharray': '6,4',
      })
    );
    svg.appendChild(
      el('line', {
        x1: pad.left,
        y1: ty,
        x2: pad.left + plotW,
        y2: ty,
        stroke: '#475569',
        'stroke-width': 1.4,
        'stroke-dasharray': '6,4',
      })
    );

    // Rámeček grafu
    svg.appendChild(
      el('rect', {
        x: pad.left,
        y: pad.top,
        width: plotW,
        height: plotH,
        fill: 'none',
        stroke: '#94a3b8',
        'stroke-width': 1.2,
      })
    );

    // Popisky kvadrantů
    const qLabels = [
      {
        x: pad.left + plotW - 8,
        y: pad.top + 16,
        anchor: 'end',
        color: '#065f46',
        text: 'Vůdčí a oblíbení',
      },
      {
        x: pad.left + plotW - 8,
        y: pad.top + plotH - 8,
        anchor: 'end',
        color: '#92400e',
        text: 'Vlivní, ale neoblíbení',
      },
      {
        x: pad.left + 8,
        y: pad.top + 16,
        anchor: 'start',
        color: '#1e40af',
        text: 'Oblíbení, menší vliv',
      },
      {
        x: pad.left + 8,
        y: pad.top + plotH - 8,
        anchor: 'start',
        color: '#991b1b',
        text: 'Izolovaní / ohrožení',
      },
    ];
    for (const ql of qLabels) {
      svg.appendChild(
        el(
          'text',
          {
            x: ql.x,
            y: ql.y,
            'text-anchor': ql.anchor,
            'font-size': 11,
            'font-weight': 700,
            fill: ql.color,
            opacity: 0.85,
            'font-family': 'system-ui, sans-serif',
          },
          ql.text
        )
      );
    }

    // Názvy os
    svg.appendChild(
      el(
        'text',
        {
          x: pad.left + plotW / 2,
          y: height - 12,
          'text-anchor': 'middle',
          'font-size': 12,
          'font-weight': 600,
          fill: '#0f172a',
          'font-family': 'system-ui, sans-serif',
        },
        '← Nižší vliv (5)          Index vlivu          Vyšší vliv (1) →'
      )
    );
    svg.appendChild(
      el(
        'text',
        {
          x: 16,
          y: pad.top + plotH / 2,
          'text-anchor': 'middle',
          'font-size': 12,
          'font-weight': 600,
          fill: '#0f172a',
          'font-family': 'system-ui, sans-serif',
          transform: `rotate(-90, 16, ${pad.top + plotH / 2})`,
        },
        '← Nižší obliba (5)      Index obliby      Vyšší obliba (1) →'
      )
    );

    // Popisek použité hranice nahoře
    const thresholdNote =
      analysis.thresholds.mode === 'mean'
        ? `Hranice: průměr třídy (vliv ${analysis.thresholds.influence}, obliba ${analysis.thresholds.sympathy})`
        : 'Hranice: střed škály (3,00)';
    svg.appendChild(
      el(
        'text',
        {
          x: pad.left + plotW,
          y: 22,
          'text-anchor': 'end',
          'font-size': 11,
          fill: '#64748b',
          'font-family': 'system-ui, sans-serif',
        },
        thresholdNote
      )
    );

    // Jednoduché rozestupy popisků při blízkých bodech
    const placedPoints = [];

    for (const item of students) {
      const cx = xScale(item.influenceIndex);
      const cy = yScale(item.sympathyIndex);

      let labelDy = -12;
      for (const prev of placedPoints) {
        if (Math.hypot(prev.cx - cx, prev.cy - cy) < 28) {
          labelDy = prev.labelDy < 0 ? 18 : -12;
        }
      }
      placedPoints.push({ cx, cy, labelDy });

      const g = el('g', {
        class: 'scatter-point',
        style: options.onSelect ? 'cursor:pointer;' : '',
      });

      const fill = item.quadrant.color;
      const gender = item.student.gender;
      let shape;
      if (gender === 'M') {
        shape = el('rect', {
          x: cx - 7,
          y: cy - 7,
          width: 14,
          height: 14,
          rx: 2,
          fill,
          stroke: '#ffffff',
          'stroke-width': 2,
        });
      } else {
        shape = el('circle', {
          cx,
          cy,
          r: 7.5,
          fill,
          stroke: '#ffffff',
          'stroke-width': 2,
        });
      }
      g.appendChild(shape);

      const displayLabel = options.getLabel
        ? options.getLabel(item.student, true)
        : item.student.code;

      g.appendChild(
        el(
          'text',
          {
            x: cx,
            y: cy + labelDy,
            'text-anchor': 'middle',
            'font-size': 11,
            'font-weight': 600,
            fill: '#0f172a',
            'font-family': 'system-ui, sans-serif',
            style: 'paint-order:stroke;stroke:#ffffff;stroke-width:3px;stroke-linejoin:round;',
          },
          displayLabel
        )
      );

      if (options.onHover) {
        g.addEventListener('mouseenter', (ev) => options.onHover(ev, item));
        g.addEventListener('mousemove', (ev) => options.onHover(ev, item));
        g.addEventListener('mouseleave', () => options.onLeave && options.onLeave());
      }
      if (options.onSelect) {
        g.addEventListener('click', () => options.onSelect(item.student.id));
      }

      svg.appendChild(g);
    }

    container.appendChild(svg);
    return svg;
  }

  /**
   * Exportuje libovolný SVG element do souboru SVG nebo PNG.
   */
  function downloadSvg(svgElement, filename) {
    if (!svgElement) return;
    const serializer = new XMLSerializer();
    let source = serializer.serializeToString(svgElement);
    if (!source.includes('xmlns="http://www.w3.org/2000/svg"')) {
      source = source.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
    }
    const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
    triggerDownload(blob, filename);
  }

  function downloadSvgAsPng(svgElement, filename, scale = 2) {
    if (!svgElement) return;
    const viewBox = svgElement.getAttribute('viewBox');
    let width = 800;
    let height = 600;
    if (viewBox) {
      const parts = viewBox.split(/\s+/).map(Number);
      if (parts.length === 4) {
        width = parts[2];
        height = parts[3];
      }
    }

    const serializer = new XMLSerializer();
    let source = serializer.serializeToString(svgElement);
    if (!source.includes('xmlns="http://www.w3.org/2000/svg"')) {
      source = source.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
    }

    const img = new Image();
    const svgBlob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    img.onload = function () {
      const canvas = document.createElement('canvas');
      canvas.width = width * scale;
      canvas.height = height * scale;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);

      canvas.toBlob((pngBlob) => {
        if (pngBlob) triggerDownload(pngBlob, filename);
      }, 'image/png');
    };
    img.src = url;
  }

  function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  root.SocioCharts = {
    renderScatterChart,
    downloadSvg,
    downloadSvgAsPng,
    triggerDownload,
  };
})(typeof self !== 'undefined' ? self : this);
