/**
 * Třídní sociometrie – Hlavní řadič uživatelského rozhraní (Varianta A – 100 % lokální webová aplikace).
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'tridni_sociometrie_project_v1';

  const state = {
    project: null,
    analysis: null,
    activeTab: 'class',
    anonymous: false,
    entryMode: 'sheet', // 'sheet' | 'matrix-influence' | 'matrix-sympathy'
    selectedRaterId: null,
    sortKey: 'code',
    sortAsc: true,
    options: {
      thresholdMode: 'fixed',
      mutualSympathyMax: 2,
      mutualAntipathyMin: 4,
    },
    socioLayout: 'orbital',
    socioFilters: {
      mutualSym: true,
      uniSym: false,
      mutualAnti: true,
      uniAnti: false,
    },
    socioFocusedId: null,
    socioCustomPositions: new Map(),
    csvImportDimension: 'influence',
    reportIncludeComments: true,
    lastScatterSvg: null,
    lastSocioSvg: null,
  };

  // --- Pomocné funkce ---
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  function esc(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatNum(val) {
    if (val === null || val === undefined || Number.isNaN(val)) return '–';
    return Number(val).toFixed(2).replace('.', ',');
  }

  function displayStudentName(student, short = false) {
    if (!student) return '–';
    if (state.anonymous) return student.code;
    if (short) {
      const first = (student.name || '').trim().split(/\s+/)[0];
      return first ? `${student.code} ${first}` : student.code;
    }
    return student.name || student.code;
  }

  function displayStudentFull(student) {
    if (!student) return '–';
    if (state.anonymous) return student.code;
    return `${student.code} – ${student.name}`;
  }

  function showToast(message, type = 'info') {
    const container = $('#toast-container');
    const div = document.createElement('div');
    div.className = `toast ${type === 'success' ? 'toast-success' : type === 'error' ? 'toast-error' : ''}`;
    div.textContent = message;
    container.appendChild(div);
    setTimeout(() => {
      div.style.opacity = '0';
      div.style.transition = 'opacity 0.25s';
      setTimeout(() => div.remove(), 260);
    }, 3200);
  }

  function nextStudentCode(students) {
    let maxNum = 0;
    for (const s of students) {
      const m = String(s.code || '').match(/(\d+)/);
      if (m) maxNum = Math.max(maxNum, Number(m[1]));
    }
    return `Ž${String(maxNum + 1).padStart(2, '0')}`;
  }

  function nextStudentId(students) {
    let maxNum = 0;
    for (const s of students) {
      const m = String(s.id || '').match(/(\d+)/);
      if (m) maxNum = Math.max(maxNum, Number(m[1]));
    }
    return `s_${maxNum + 1}`;
  }

  function saveToLocalStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.project));
    } catch {
      // Ignorovat případnou plnou kvótu nebo soukromý režim
    }
  }

  function loadInitialProject() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.students)) {
          return parsed;
        }
      }
    } catch {
      // Fallback na ukázkovou třídu
    }
    return SocioSampleData.createSampleProject();
  }

  function recompute(persist = true) {
    if (persist) saveToLocalStorage();
    state.analysis = SocioEngine.analyze(state.project, state.options);

    // Ujistit se, že vybraný hodnotitel existuje
    const ids = new Set(state.project.students.map((s) => s.id));
    if (!state.selectedRaterId || !ids.has(state.selectedRaterId)) {
      state.selectedRaterId = state.project.students[0]?.id || null;
    }
    if (state.socioFocusedId && !ids.has(state.socioFocusedId)) {
      state.socioFocusedId = null;
    }

    updateHeaderBadges();
    renderActiveTab();
  }

  function updateHeaderBadges() {
    const a = state.analysis;
    $('#badge-students').textContent = String(a.studentCount);
    const avgComp = Math.round(((a.completeness.influence + a.completeness.sympathy) / 2) * 100);
    $('#badge-completeness').textContent = `${avgComp} %`;
    $('#nav-class-pill').textContent = state.project.meta.className || 'Nepojmenovaná třída';
  }

  function setTab(tabName) {
    state.activeTab = tabName;
    $$('.nav-tab').forEach((btn) => {
      const active = btn.dataset.tab === tabName;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', String(active));
    });
    $$('.tab-panel').forEach((panel) => {
      panel.classList.toggle('active', panel.id === `panel-${tabName}`);
    });
    renderActiveTab();
  }

  function renderActiveTab() {
    switch (state.activeTab) {
      case 'class':
        renderClassTab();
        break;
      case 'matrix':
        renderMatrixTab();
        break;
      case 'overview':
        renderOverviewTab();
        break;
      case 'sociogram':
        renderSociogramTab();
        break;
      case 'report':
        renderReportTab();
        break;
    }
  }

  // =========================================================================
  // ZÁLOŽKA 1: TŘÍDA A ŽÁCI
  // =========================================================================
  function renderClassTab() {
    const m = state.project.meta;
    $('#meta-class-name').value = m.className || '';
    $('#meta-school').value = m.school || '';
    $('#meta-date').value = m.date || '';
    $('#meta-note').value = m.psychologistNote || '';

    const students = state.project.students;
    $('#student-count-label').textContent = String(students.length);

    const tbody = $('#students-tbody');
    if (students.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="4" class="muted-small" style="text-align:center;padding:20px;">Zatím nejsou přidáni žádní žáci. Přidejte je výše nebo načtěte Ukázkovou třídu.</td></tr>';
      return;
    }

    tbody.innerHTML = students
      .map((s) => {
        const nameVal = state.anonymous ? `${s.code} (skryto v anonymním režimu)` : s.name;
        return `
          <tr data-student-id="${esc(s.id)}">
            <td><span class="code-badge">${esc(s.code)}</span></td>
            <td>
              <input type="text" class="inline-name-edit" value="${esc(nameVal)}"
                ${state.anonymous ? 'disabled' : ''}
                data-id="${esc(s.id)}" style="width:100%;max-width:260px;" />
            </td>
            <td>
              <select class="inline-gender-edit" data-id="${esc(s.id)}">
                <option value="O" ${s.gender === 'O' ? 'selected' : ''}>Neuvedeno</option>
                <option value="F" ${s.gender === 'F' ? 'selected' : ''}>Dívka (○)</option>
                <option value="M" ${s.gender === 'M' ? 'selected' : ''}>Chlapec (□)</option>
              </select>
            </td>
            <td class="text-right">
              <button class="btn btn-ghost btn-sm text-danger btn-del-student" data-id="${esc(s.id)}" title="Odstranit žáka">
                Smazat
              </button>
            </td>
          </tr>
        `;
      })
      .join('');

    tbody.querySelectorAll('.inline-name-edit').forEach((inp) => {
      inp.addEventListener('change', () => {
        const st = state.project.students.find((x) => x.id === inp.dataset.id);
        if (st && inp.value.trim()) {
          st.name = inp.value.trim();
          recompute();
        }
      });
    });

    tbody.querySelectorAll('.inline-gender-edit').forEach((sel) => {
      sel.addEventListener('change', () => {
        const st = state.project.students.find((x) => x.id === sel.dataset.id);
        if (st) {
          st.gender = sel.value;
          recompute();
        }
      });
    });

    tbody.querySelectorAll('.btn-del-student').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const st = state.project.students.find((x) => x.id === id);
        if (!st) return;
        if (!confirm(`Opravdu odstranit žáka ${displayStudentFull(st)} včetně všech jeho hodnocení?`)) {
          return;
        }
        state.project.students = state.project.students.filter((x) => x.id !== id);
        delete state.project.ratings[id];
        for (const raterId of Object.keys(state.project.ratings)) {
          delete state.project.ratings[raterId][id];
        }
        state.socioCustomPositions.delete(id);
        recompute();
        showToast('Žák byl odstraněn.', 'info');
      });
    });
  }

  // =========================================================================
  // ZÁLOŽKA 2: ZADÁVÁNÍ DAT (ARCH + MATICE)
  // =========================================================================
  function renderMatrixTab() {
    const c = state.analysis.completeness;
    const infPct = Math.round(c.influence * 100);
    const symPct = Math.round(c.sympathy * 100);

    $('#completeness-summary').innerHTML = `
      <div><strong>Kompletnost dat:</strong> Vliv ${infPct} % (${c.filledInfluence}/${c.maxCells}) · Sympatie ${symPct} % (${c.filledSympathy}/${c.maxCells})</div>
      <div class="progress-track"><div class="progress-fill" style="width:${Math.round((infPct + symPct) / 2)}%"></div></div>
    `;

    const isSheet = state.entryMode === 'sheet';
    $('#entry-sheet-view').classList.toggle('hidden', !isSheet);
    $('#entry-matrix-view').classList.toggle('hidden', isSheet);

    $$('[data-entry-mode]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.entryMode === state.entryMode);
    });

    if (state.project.students.length < 2) {
      const msg =
        '<div style="padding:24px;text-align:center;color:#64748b;">Pro zadávání hodnocení přidejte v záložce <strong>1. Třída a žáci</strong> alespoň 2 žáky.</div>';
      if (isSheet) $('#sheet-tbody').innerHTML = `<tr><td colspan="5">${msg}</td></tr>`;
      else $('#matrix-grid-container').innerHTML = msg;
      return;
    }

    if (isSheet) {
      renderEntrySheet();
    } else {
      const dim = state.entryMode === 'matrix-influence' ? 'influence' : 'sympathy';
      renderMatrixGrid(dim);
    }
  }

  function renderEntrySheet() {
    const students = state.project.students;
    const select = $('#select-rater');
    select.innerHTML = students
      .map(
        (s) =>
          `<option value="${esc(s.id)}" ${s.id === state.selectedRaterId ? 'selected' : ''}>${esc(
            displayStudentFull(s)
          )}</option>`
      )
      .join('');

    const raterId = state.selectedRaterId;
    const tbody = $('#sheet-tbody');
    const targets = students.filter((s) => s.id !== raterId);

    tbody.innerHTML = targets
      .map((target) => {
        const r = SocioEngine.getRating(state.project, raterId, target.id);
        const infCls = r.influence ? `s${r.influence}` : '';
        const symCls = r.sympathy ? `s${r.sympathy}` : '';
        return `
          <tr>
            <td><span class="code-badge">${esc(target.code)}</span></td>
            <td><strong>${esc(displayStudentName(target))}</strong></td>
            <td>
              <input type="text" inputmode="numeric" maxlength="1"
                class="score-input ${infCls}"
                data-dim="influence" data-target="${esc(target.id)}"
                value="${r.influence ?? ''}" placeholder="1–5" />
            </td>
            <td>
              <input type="text" inputmode="numeric" maxlength="1"
                class="score-input ${symCls}"
                data-dim="sympathy" data-target="${esc(target.id)}"
                value="${r.sympathy ?? ''}" placeholder="1–5" />
            </td>
            <td>
              <input type="text" class="comment-input"
                data-dim="comment" data-target="${esc(target.id)}"
                value="${esc(r.comment)}" placeholder="Volitelný komentář spolužáka…" />
            </td>
          </tr>
        `;
      })
      .join('');

    const scoreInputs = Array.from(tbody.querySelectorAll('.score-input'));
    scoreInputs.forEach((inp, idx) => {
      inp.addEventListener('focus', () => inp.select());
      inp.addEventListener('input', () => {
        const raw = inp.value.trim();
        if (raw === '') {
          setCellValue(raterId, inp.dataset.target, inp.dataset.dim, null);
          applyScoreColorClass(inp, null);
          return;
        }
        const n = Number(raw);
        if (SocioEngine.isValidScore(n)) {
          setCellValue(raterId, inp.dataset.target, inp.dataset.dim, n);
          applyScoreColorClass(inp, n);
          // Automatický přesun na další pole pro bleskové zadávání
          if (scoreInputs[idx + 1]) {
            scoreInputs[idx + 1].focus();
            scoreInputs[idx + 1].select();
          }
        } else {
          inp.value = '';
        }
      });
    });

    tbody.querySelectorAll('.comment-input').forEach((inp) => {
      inp.addEventListener('change', () => {
        setCellValue(raterId, inp.dataset.target, 'comment', inp.value);
      });
    });
  }

  function renderMatrixGrid(dimension) {
    const students = state.project.students;
    const container = $('#matrix-grid-container');

    let html = '<table class="matrix-table"><thead><tr><th>Hodnotitel \\ Hodnocený</th>';
    for (const target of students) {
      html += `<th title="${esc(displayStudentFull(target))}">${esc(target.code)}</th>`;
    }
    html += '</tr></thead><tbody>';

    students.forEach((rater, rIdx) => {
      html += `<tr><th title="${esc(displayStudentFull(rater))}">${esc(
        displayStudentName(rater, true)
      )}</th>`;
      students.forEach((target, cIdx) => {
        if (rater.id === target.id) {
          html += '<td class="matrix-cell-diag">–</td>';
        } else {
          const r = SocioEngine.getRating(state.project, rater.id, target.id);
          const val = dimension === 'influence' ? r.influence : r.sympathy;
          const cls = val ? `s${val}` : '';
          html += `<td class="${cls}">
            <input type="text" inputmode="numeric" maxlength="1"
              class="matrix-cell-input"
              data-r="${rIdx}" data-c="${cIdx}"
              data-rater="${esc(rater.id)}" data-target="${esc(target.id)}"
              value="${val ?? ''}" />
          </td>`;
        }
      });
      html += '</tr>';
    });

    html += '</tbody></table>';
    container.innerHTML = html;

    const n = students.length;
    const focusCell = (r, c) => {
      if (r < 0 || r >= n || c < 0 || c >= n) return;
      const targetInp = container.querySelector(
        `.matrix-cell-input[data-r="${r}"][data-c="${c}"]`
      );
      if (targetInp) {
        targetInp.focus();
        targetInp.select();
      }
    };

    container.querySelectorAll('.matrix-cell-input').forEach((inp) => {
      const rIdx = Number(inp.dataset.r);
      const cIdx = Number(inp.dataset.c);

      inp.addEventListener('focus', () => inp.select());

      inp.addEventListener('input', () => {
        const raw = inp.value.trim();
        const td = inp.parentElement;
        if (raw === '') {
          setCellValue(inp.dataset.rater, inp.dataset.target, dimension, null);
          applyScoreColorClass(td, null);
          return;
        }
        const num = Number(raw);
        if (SocioEngine.isValidScore(num)) {
          setCellValue(inp.dataset.rater, inp.dataset.target, dimension, num);
          applyScoreColorClass(td, num);
          // Posun doprava (přeskočí diagonálu)
          let nextC = cIdx + 1;
          let nextR = rIdx;
          if (nextC === nextR) nextC++;
          if (nextC >= n) {
            nextR++;
            nextC = nextR === 0 ? 1 : 0;
          }
          if (nextR < n) focusCell(nextR, nextC);
        } else {
          inp.value = '';
        }
      });

      inp.addEventListener('keydown', (ev) => {
        if (ev.key === 'ArrowRight') {
          ev.preventDefault();
          const nc = cIdx + 1 === rIdx ? cIdx + 2 : cIdx + 1;
          focusCell(rIdx, nc);
        } else if (ev.key === 'ArrowLeft') {
          ev.preventDefault();
          const nc = cIdx - 1 === rIdx ? cIdx - 2 : cIdx - 1;
          focusCell(rIdx, nc);
        } else if (ev.key === 'ArrowDown') {
          ev.preventDefault();
          const nr = rIdx + 1 === cIdx ? rIdx + 2 : rIdx + 1;
          focusCell(nr, cIdx);
        } else if (ev.key === 'ArrowUp') {
          ev.preventDefault();
          const nr = rIdx - 1 === cIdx ? rIdx - 2 : rIdx - 1;
          focusCell(nr, cIdx);
        }
      });
    });
  }

  function setCellValue(raterId, targetId, field, value) {
    if (!state.project.ratings[raterId]) state.project.ratings[raterId] = {};
    if (!state.project.ratings[raterId][targetId]) {
      state.project.ratings[raterId][targetId] = { influence: null, sympathy: null, comment: '' };
    }
    state.project.ratings[raterId][targetId][field] = value;

    saveToLocalStorage();
    state.analysis = SocioEngine.analyze(state.project, state.options);
    updateHeaderBadges();

    // Aktualizovat pouze proužek kompletnosti bez přerušení focusu
    const c = state.analysis.completeness;
    const infPct = Math.round(c.influence * 100);
    const symPct = Math.round(c.sympathy * 100);
    const bar = $('#completeness-summary');
    if (bar) {
      bar.innerHTML = `
        <div><strong>Kompletnost dat:</strong> Vliv ${infPct} % (${c.filledInfluence}/${c.maxCells}) · Sympatie ${symPct} % (${c.filledSympathy}/${c.maxCells})</div>
        <div class="progress-track"><div class="progress-fill" style="width:${Math.round((infPct + symPct) / 2)}%"></div></div>
      `;
    }
  }

  function applyScoreColorClass(el, score) {
    el.classList.remove('s1', 's2', 's3', 's4', 's5');
    if (score >= 1 && score <= 5) el.classList.add(`s${score}`);
  }

  // =========================================================================
  // ZÁLOŽKA 3: VÝSLEDKY A ANALÝZA
  // =========================================================================
  function renderOverviewTab() {
    const a = state.analysis;
    const cm = a.classMetrics;

    $('#opt-threshold-mode').value = state.options.thresholdMode;
    $('#opt-sympathy-max').value = String(state.options.mutualSympathyMax);
    $('#opt-antipathy-min').value = String(state.options.mutualAntipathyMin);

    // KPI karty
    $('#kpi-grid').innerHTML = `
      <div class="kpi-card">
        <div class="kpi-label">Třídní index obliby</div>
        <div class="kpi-value">${formatNum(cm.sympathyMean)}</div>
        <div class="kpi-sub">Škála 1 (nejlepší) – 5 · SD žáků: ${formatNum(cm.sympathyDispersion)}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Třídní index vlivu</div>
        <div class="kpi-value">${formatNum(cm.influenceMean)}</div>
        <div class="kpi-sub">Rozptyl vlivu (SD): ${formatNum(cm.influenceDispersion)}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Koheze (soudržnost)</div>
        <div class="kpi-value">${cm.cohesionIndex !== null ? cm.cohesionIndex + ' %' : '–'}</div>
        <div class="kpi-sub">${cm.mutualSympathyPairs} vzájemných sympatií z ${cm.totalEvaluatedPairs} dvojic</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Rizikové signály</div>
        <div class="kpi-value" style="color:${cm.atRiskCount > 0 ? '#dc2626' : '#059669'}">${cm.atRiskCount}</div>
        <div class="kpi-sub">${cm.quadrantCounts.isolated_at_risk} ohrožených · ${cm.mutualAntipathyPairs} vzáj. antipatií</div>
      </div>
    `;

    // Interpretace klimatu
    const cs = a.climateSummary;
    $('#climate-notes-box').innerHTML = `
      <div class="climate-banner climate-${esc(cs.atmosphereLevel)}">
        ${esc(cs.atmosphereLabel)} · <span style="font-weight:500;">${esc(cs.cohesionLabel)}</span>
      </div>
      <ul class="climate-notes">
        ${cs.notes.map((n) => `<li>${esc(n)}</li>`).join('')}
      </ul>
      <div class="muted-small mt-12">
        Rozložení kvadrantů:
        <strong>${cm.quadrantCounts.leader_popular}</strong> vůdčí &amp; oblíbení ·
        <strong>${cm.quadrantCounts.leader_unpopular}</strong> vlivní &amp; neoblíbení ·
        <strong>${cm.quadrantCounts.popular_low_influence}</strong> oblíbení ·
        <strong>${cm.quadrantCounts.isolated_at_risk}</strong> ohrožení / izolovaní
      </div>
    `;

    // Kliky a izolovaní
    const studentById = new Map(state.project.students.map((s) => [s.id, s]));
    let cliquesHtml = '';

    if (a.cliques.groups.length === 0 && a.cliques.pairs.length === 0) {
      cliquesHtml +=
        '<p class="muted-small">Nebyly detekovány žádné vzájemně provázané skupinky ani dvojice.</p>';
    } else {
      a.cliques.groups.forEach((group, idx) => {
        const color = SocioGraph.CLIQUE_PALETTE[idx % SocioGraph.CLIQUE_PALETTE.length];
        cliquesHtml += `
          <div class="clique-card">
            <div class="clique-title">
              <span class="clique-dot" style="background:${color}"></span>
              Skupinka (klika) #${idx + 1} – ${group.length} žáci
            </div>
            <div class="member-chips">
              ${group
                .map((id) => {
                  const st = studentById.get(id);
                  return `<span class="member-chip" data-open-student="${esc(id)}">${esc(
                    displayStudentName(st, true)
                  )}</span>`;
                })
                .join('')}
            </div>
          </div>
        `;
      });

      if (a.cliques.pairs.length > 0) {
        cliquesHtml += `
          <div class="clique-card">
            <div class="clique-title">Samostatné vzájemné dvojice (${a.cliques.pairs.length})</div>
            <div class="member-chips">
              ${a.cliques.pairs
                .map(([idA, idB]) => {
                  const sa = studentById.get(idA);
                  const sb = studentById.get(idB);
                  return `<span class="member-chip" data-open-student="${esc(idA)}">${esc(
                    displayStudentName(sa, true)
                  )} ↔ ${esc(displayStudentName(sb, true))}</span>`;
                })
                .join('')}
            </div>
          </div>
        `;
      }
    }

    if (a.cliques.isolatedIds.length > 0) {
      cliquesHtml += `
        <div class="clique-card" style="border-color:#fecaca;background:#fef2f2;">
          <div class="clique-title" style="color:#991b1b;">
            ⚠️ Bez vzájemné sympatie (${a.cliques.isolatedIds.length})
          </div>
          <div class="member-chips">
            ${a.cliques.isolatedIds
              .map((id) => {
                const st = studentById.get(id);
                return `<span class="member-chip" data-open-student="${esc(id)}">${esc(
                  displayStudentName(st, true)
                )}</span>`;
              })
              .join('')}
          </div>
        </div>
      `;
    }

    const cliquesBox = $('#cliques-box');
    cliquesBox.innerHTML = cliquesHtml;
    cliquesBox.querySelectorAll('[data-open-student]').forEach((chip) => {
      chip.addEventListener('click', () => openStudentModal(chip.dataset.openStudent));
    });

    // Tabulka všech žáků (seřazená)
    const sorted = [...a.students].sort((x, y) => {
      const dir = state.sortAsc ? 1 : -1;
      const getVal = (item) => {
        switch (state.sortKey) {
          case 'code':
            return item.student.code;
          case 'name':
            return displayStudentName(item.student);
          case 'influenceIndex':
            return item.influenceIndex ?? 99;
          case 'sympathyIndex':
            return item.sympathyIndex ?? 99;
          case 'posSympathyReceived':
            return item.posSympathyReceived;
          case 'negSympathyReceived':
            return item.negSympathyReceived;
          case 'mutualSymCount':
            return item.mutualSympathies.length;
          case 'givenSympathyMean':
            return item.givenSympathyMean ?? 99;
          default:
            return item.student.code;
        }
      };
      const vx = getVal(x);
      const vy = getVal(y);
      if (typeof vx === 'string') return vx.localeCompare(vy, 'cs') * dir;
      return (vx - vy) * dir;
    });

    const tbody = $('#results-tbody');
    if (sorted.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="9" class="muted-small" style="text-align:center;padding:20px;">Žádná data k zobrazení.</td></tr>';
      return;
    }

    tbody.innerHTML = sorted
      .map((item) => {
        const flagsHtml = item.riskFlags
          .slice(0, 2)
          .map((f) => `<span class="flag-badge">${esc(f)}</span>`)
          .join('');
        return `
          <tr class="clickable-row" data-student-id="${esc(item.student.id)}">
            <td><span class="code-badge">${esc(item.student.code)}</span></td>
            <td><strong>${esc(displayStudentName(item.student))}</strong></td>
            <td><strong>${formatNum(item.influenceIndex)}</strong></td>
            <td><strong>${formatNum(item.sympathyIndex)}</strong></td>
            <td>${item.posSympathyReceived}</td>
            <td style="${item.negSympathyReceived >= 4 ? 'color:#dc2626;font-weight:700;' : ''}">${item.negSympathyReceived}</td>
            <td>${item.mutualSympathies.length}</td>
            <td>${formatNum(item.givenSympathyMean)}</td>
            <td>
              <span class="q-badge q-${esc(item.quadrant.id)}">${esc(item.quadrant.shortLabel)}</span>
              ${flagsHtml}
            </td>
          </tr>
        `;
      })
      .join('');

    tbody.querySelectorAll('tr.clickable-row').forEach((tr) => {
      tr.addEventListener('click', () => openStudentModal(tr.dataset.studentId));
    });
  }

  // =========================================================================
  // ZÁLOŽKA 4: GRAFY A SOCIOGRAM
  // =========================================================================
  function renderSociogramTab() {
    const tooltip = $('#chart-tooltip');

    const showTooltip = (ev, item) => {
      tooltip.innerHTML = `
        <strong>${esc(displayStudentFull(item.student))}</strong><br/>
        Index vlivu: <strong>${formatNum(item.influenceIndex)}</strong> ·
        Index obliby: <strong>${formatNum(item.sympathyIndex)}</strong><br/>
        Pozice: ${esc(item.quadrant.label)}<br/>
        Vzáj. sympatie: ${item.mutualSympathies.length} · Vzáj. antipatie: ${item.mutualAntipathies.length}<br/>
        <span style="opacity:0.75;">Kliknutí: fokus / detail</span>
      `;
      tooltip.classList.remove('hidden');
      const left = Math.min(window.innerWidth - 285, ev.clientX + 14);
      const top = Math.min(window.innerHeight - 130, ev.clientY + 14);
      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${top}px`;
    };

    const hideTooltip = () => tooltip.classList.add('hidden');

    // 1. Poziční graf
    state.lastScatterSvg = SocioCharts.renderScatterChart(
      $('#scatter-container'),
      state.analysis,
      {
        getLabel: (student) => displayStudentName(student, true),
        onHover: showTooltip,
        onLeave: hideTooltip,
        onSelect: (id) => openStudentModal(id),
      }
    );

    // 2. Interaktivní sociogram
    $$('[data-socio-layout]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.socioLayout === state.socioLayout);
    });
    $('#flt-mutual-sym').checked = state.socioFilters.mutualSym;
    $('#flt-uni-sym').checked = state.socioFilters.uniSym;
    $('#flt-mutual-anti').checked = state.socioFilters.mutualAnti;
    $('#flt-uni-anti').checked = state.socioFilters.uniAnti;
    $('#btn-clear-socio-focus').style.display = state.socioFocusedId ? 'inline-flex' : 'none';

    state.lastSocioSvg = SocioGraph.renderSociogram(
      $('#sociogram-container'),
      state.analysis,
      {
        layout: state.socioLayout,
        filters: state.socioFilters,
        focusedId: state.socioFocusedId,
        customPositions: state.socioCustomPositions,
        getLabel: (student) => (state.anonymous ? student.code : displayStudentName(student, true)),
        onHover: showTooltip,
        onLeave: hideTooltip,
        onFocusToggle: (id) => {
          state.socioFocusedId = state.socioFocusedId === id ? null : id;
          renderSociogramTab();
        },
        onOpenDetail: (id) => openStudentModal(id),
      }
    );
  }

  // =========================================================================
  // ZÁLOŽKA 5: TISKOVÝ / PDF REPORT
  // =========================================================================
  function renderReportTab() {
    const a = state.analysis;
    const cm = a.classMetrics;
    const m = state.project.meta;
    const studentById = new Map(state.project.students.map((s) => [s.id, s]));

    const sheet = $('#report-sheet');
    const modeLabel = state.anonymous ? 'Anonymizovaný výstup (kódy)' : 'Plný výstup (jména žáků)';

    let commentsBlock = '';
    if (state.reportIncludeComments) {
      const allComments = [];
      for (const s of a.students) {
        for (const c of s.commentsReceived) {
          allComments.push({ target: s.student, ...c });
        }
      }
      if (allComments.length > 0) {
        commentsBlock = `
          <section class="report-section">
            <h3>Slovní komentáře spolužáků (${allComments.length})</h3>
            <table class="data-table">
              <thead>
                <tr>
                  <th>Hodnocený žák</th>
                  <th>Autor komentáře</th>
                  <th>Sympatie</th>
                  <th>Komentář</th>
                </tr>
              </thead>
              <tbody>
                ${allComments
                  .map((c) => {
                    const author = studentById.get(c.fromId);
                    return `
                      <tr>
                        <td><strong>${esc(displayStudentName(c.target, true))}</strong></td>
                        <td>${esc(displayStudentName(author, true))}</td>
                        <td>${c.sympathy ?? '–'}</td>
                        <td>${esc(c.text)}</td>
                      </tr>
                    `;
                  })
                  .join('')}
              </tbody>
            </table>
          </section>
        `;
      }
    }

    sheet.innerHTML = `
      <header class="report-header">
        <div>
          <h1 style="font-size:1.35rem;">Zpráva ze sociometricko-ratingového šetření</h1>
          <p class="muted-small">
            Třída: <strong>${esc(m.className || '–')}</strong>
            ${m.school ? ` · ${esc(m.school)}` : ''}
            · Počet žáků: <strong>${a.studentCount}</strong>
          </p>
        </div>
        <div class="text-right muted-small">
          <div>Datum šetření: <strong>${esc(m.date || '–')}</strong></div>
          <div>Režim výstupu: ${esc(modeLabel)}</div>
        </div>
      </header>

      <section class="report-section">
        <h3>1. Souhrn klimatu a soudržnosti třídy</h3>
        <div class="detail-stat-grid">
          <div class="detail-stat">
            <div class="detail-stat-val">${formatNum(cm.sympathyMean)}</div>
            <div class="detail-stat-lbl">Třídní index obliby (1–5)</div>
          </div>
          <div class="detail-stat">
            <div class="detail-stat-val">${formatNum(cm.influenceMean)}</div>
            <div class="detail-stat-lbl">Třídní index vlivu (1–5)</div>
          </div>
          <div class="detail-stat">
            <div class="detail-stat-val">${cm.cohesionIndex !== null ? cm.cohesionIndex + ' %' : '–'}</div>
            <div class="detail-stat-lbl">Koheze (vzáj. sympatie)</div>
          </div>
          <div class="detail-stat">
            <div class="detail-stat-val">${cm.atRiskCount}</div>
            <div class="detail-stat-lbl">Žáků s rizikovým signálem</div>
          </div>
        </div>
        <p><strong>Celkové hodnocení:</strong> ${esc(a.climateSummary.atmosphereLabel)} (${esc(
          a.climateSummary.cohesionLabel
        )}).</p>
        <ul class="climate-notes mt-8">
          ${a.climateSummary.notes.map((n) => `<li>${esc(n)}</li>`).join('')}
        </ul>
      </section>

      <section class="report-section">
        <h3>2. Poziční graf a orbitální sociogram</h3>
        <div class="report-charts-grid">
          <div class="report-chart-box" id="report-scatter-slot"></div>
          <div class="report-chart-box" id="report-socio-slot"></div>
        </div>
      </section>

      <section class="report-section">
        <h3>3. Přehled výsledků jednotlivých žáků</h3>
        <table class="data-table">
          <thead>
            <tr>
              <th>Kód</th>
              <th>Žák</th>
              <th>Index vlivu</th>
              <th>Index obliby</th>
              <th>1–2</th>
              <th>4–5</th>
              <th>Vzáj. symp.</th>
              <th>Typologie</th>
            </tr>
          </thead>
          <tbody>
            ${a.students
              .map(
                (item) => `
              <tr>
                <td>${esc(item.student.code)}</td>
                <td><strong>${esc(displayStudentName(item.student))}</strong></td>
                <td>${formatNum(item.influenceIndex)}</td>
                <td>${formatNum(item.sympathyIndex)}</td>
                <td>${item.posSympathyReceived}</td>
                <td>${item.negSympathyReceived}</td>
                <td>${item.mutualSympathies.length}</td>
                <td>${esc(item.quadrant.shortLabel)}${
                  item.riskFlags.length ? ` (${esc(item.riskFlags[0])})` : ''
                }</td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      </section>

      ${commentsBlock}

      <section class="report-section">
        <h3>4. Závěry a doporučení školního psychologa</h3>
        <textarea id="report-conclusion-textarea" class="report-conclusion-input" placeholder="Zde zapište odbornou interpretaci, doporučení pro třídního učitele a návrh případných intervencí…">${esc(
          m.conclusion || ''
        )}</textarea>
      </section>

      <footer class="muted-small" style="border-top:1px solid #e2e8f0;padding-top:8px;font-size:0.76rem;">
        Vygenerováno lokálně v aplikaci Třídní sociometrie (otevřený sociometricko-ratingový nástroj, data neopustila prohlížeč). Výstupy jsou určeny výhradně pro odbornou práci školního poradenského pracoviště.
      </footer>
    `;

    // Vykreslit oba grafy do reportu
    SocioCharts.renderScatterChart($('#report-scatter-slot'), a, {
      width: 560,
      height: 430,
      getLabel: (st) => displayStudentName(st, true),
    });

    SocioGraph.renderSociogram($('#report-socio-slot'), a, {
      width: 560,
      height: 430,
      layout: 'orbital',
      staticMode: true,
      filters: { mutualSym: true, uniSym: false, mutualAnti: true, uniAnti: false },
      getLabel: (st) => (state.anonymous ? st.code : displayStudentName(st, true)),
    });

    $('#report-conclusion-textarea').addEventListener('input', (ev) => {
      state.project.meta.conclusion = ev.target.value;
      saveToLocalStorage();
    });
  }

  // =========================================================================
  // MODÁLNÍ OKNO: DETAIL ŽÁKA
  // =========================================================================
  function openStudentModal(studentId) {
    const item = state.analysis.students.find((s) => s.student.id === studentId);
    if (!item) return;

    const studentById = new Map(state.project.students.map((s) => [s.id, s]));
    const labelById = (id) => displayStudentName(studentById.get(id), true);

    $('#modal-student-title').textContent = `Detail žáka: ${displayStudentFull(item.student)}`;

    const chipList = (arr, emptyText) => {
      if (!arr || arr.length === 0) return `<span class="muted-small">${emptyText}</span>`;
      return `<div class="member-chips">${arr
        .map(
          (entry) =>
            `<span class="member-chip" data-jump-student="${esc(entry.id)}">${esc(
              labelById(entry.id)
            )}</span>`
        )
        .join('')}</div>`;
    };

    const commentsHtml =
      item.commentsReceived.length > 0
        ? item.commentsReceived
            .map((c) => {
              const author = studentById.get(c.fromId);
              return `
                <div class="comment-item">
                  <div class="muted-small">
                    <strong>${esc(displayStudentName(author, true))}</strong>
                    · sympatie: ${c.sympathy ?? '–'} · vliv: ${c.influence ?? '–'}
                  </div>
                  <div class="mt-8" style="margin-top:3px;">„${esc(c.text)}“</div>
                </div>
              `;
            })
            .join('')
        : '<p class="muted-small">K tomuto žákovi nejsou zadané žádné slovní komentáře.</p>';

    const body = $('#modal-student-body');
    body.innerHTML = `
      <div class="detail-stat-grid">
        <div class="detail-stat">
          <div class="detail-stat-val">${formatNum(item.influenceIndex)}</div>
          <div class="detail-stat-lbl">Index vlivu (SD ${formatNum(item.influenceStdDev)})</div>
        </div>
        <div class="detail-stat">
          <div class="detail-stat-val">${formatNum(item.sympathyIndex)}</div>
          <div class="detail-stat-lbl">Index obliby (SD ${formatNum(item.sympathyStdDev)})</div>
        </div>
        <div class="detail-stat">
          <div class="detail-stat-val">${item.posSympathyReceived} / ${item.negSympathyReceived}</div>
          <div class="detail-stat-lbl">Přijaté 1–2 / 4–5</div>
        </div>
        <div class="detail-stat">
          <div class="detail-stat-val">${formatNum(item.givenSympathyMean)}</div>
          <div class="detail-stat-lbl">Průměr udělených sympatií</div>
        </div>
      </div>

      <div class="mb-12">
        <span class="q-badge q-${esc(item.quadrant.id)}">${esc(item.quadrant.label)}</span>
        ${item.riskFlags.map((f) => `<span class="flag-badge">${esc(f)}</span>`).join('')}
        <p class="muted-small mt-8">${esc(item.quadrant.description)}</p>
      </div>

      <div class="grid-two-col">
        <div>
          <h3>💚 Vzájemné sympatie (${item.mutualSympathies.length})</h3>
          <div class="mt-8">${chipList(item.mutualSympathies, 'Žádné vzájemné sympatie.')}</div>

          <h3 class="mt-16">→ Koho má žák rád (jednostranně)</h3>
          <div class="mt-8">${chipList(item.unilateralSympathiesOut, 'Žádné jednostranné.')}</div>
        </div>
        <div>
          <h3>💔 Vzájemné antipatie (${item.mutualAntipathies.length})</h3>
          <div class="mt-8">${chipList(item.mutualAntipathies, 'Žádné vzájemné antipatie.')}</div>

          <h3 class="mt-16">← Kdo žáka odmítá (jednostranně)</h3>
          <div class="mt-8">${chipList(item.unilateralAntipathiesIn, 'Žádné jednostranné.')}</div>
        </div>
      </div>

      <div class="mt-16">
        <h3>💬 Slovní komentáře od spolužáků (${item.commentsReceived.length})</h3>
        <div class="mt-8">${commentsHtml}</div>
      </div>
    `;

    body.querySelectorAll('[data-jump-student]').forEach((chip) => {
      chip.addEventListener('click', () => openStudentModal(chip.dataset.jumpStudent));
    });

    $('#modal-student').classList.remove('hidden');
  }

  // =========================================================================
  // IMPORT / EXPORT SOUBORŮ
  // =========================================================================
  function getSafeFilenameBase() {
    const raw = (state.project.meta.className || 'trida').toLowerCase();
    return raw
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'trida';
  }

  async function handleFileOpen(file) {
    if (!file) return;
    const text = await file.text();
    const name = file.name.toLowerCase();

    try {
      if (name.endsWith('.socioenc') || text.includes('"tridni-sociometrie-encrypted"')) {
        const pass = prompt('Soubor je zašifrovaný. Zadejte heslo pro dešifrování:');
        if (!pass) return;
        const decrypted = await SocioCrypto.decryptProject(text, pass);
        if (!decrypted || !Array.isArray(decrypted.students)) {
          throw new Error('Dešifrovaný soubor nemá platnou strukturu projektu.');
        }
        state.project = decrypted;
        state.socioCustomPositions.clear();
        recompute();
        showToast('Šifrovaný projekt byl úspěšně načten.', 'success');
      } else if (name.endsWith('.json')) {
        const parsed = JSON.parse(text);
        if (!parsed || !Array.isArray(parsed.students)) {
          throw new Error('Neplatný formát JSON projektu.');
        }
        state.project = parsed;
        state.socioCustomPositions.clear();
        recompute();
        showToast('Projekt JSON byl úspěšně načten.', 'success');
      } else if (name.endsWith('.csv')) {
        const count = SocioEngine.importMatrixFromCSV(state.project, 'sympathy', text);
        recompute();
        showToast(`Importováno ${count} hodnot sympatií z CSV.`, 'success');
      } else {
        throw new Error('Nepodporovaný formát souboru. Použijte .socioenc, .json nebo .csv.');
      }
    } catch (err) {
      showToast(err.message || 'Chyba při načítání souboru.', 'error');
    }
  }

  // =========================================================================
  // NAVÁZÁNÍ UDÁLOSTÍ A START
  // =========================================================================
  function bindEvents() {
    // Navigace záložek
    $$('.nav-tab').forEach((btn) => {
      btn.addEventListener('click', () => setTab(btn.dataset.tab));
    });

    // Anonymní režim
    $('#toggle-anonymous').addEventListener('change', (ev) => {
      state.anonymous = ev.target.checked;
      renderActiveTab();
      showToast(
        state.anonymous ? 'Anonymní režim zapnut (zobrazují se jen kódy).' : 'Anonymní režim vypnut.',
        'info'
      );
    });

    // Ukázková třída
    $('#btn-load-sample').addEventListener('click', () => {
      if (
        state.project.students.length > 0 &&
        !confirm('Nahradit aktuální data ukázkovou třídou 8.B (14 žáků)?')
      ) {
        return;
      }
      state.project = SocioSampleData.createSampleProject();
      state.socioCustomPositions.clear();
      state.socioFocusedId = null;
      recompute();
      showToast('Ukázková třída 8.B byla načtena.', 'success');
    });

    // Nová prázdná třída
    $('#btn-reset-project').addEventListener('click', () => {
      if (!confirm('Vytvořit novou prázdnou třídu? Neuložená data budou smazána.')) return;
      state.project = SocioEngine.createEmptyProject();
      state.socioCustomPositions.clear();
      state.socioFocusedId = null;
      recompute();
      showToast('Vytvořena nová prázdná třída.', 'info');
    });

    // Metadata formulář
    $('#meta-class-name').addEventListener('input', (ev) => {
      state.project.meta.className = ev.target.value;
      saveToLocalStorage();
      updateHeaderBadges();
    });
    $('#meta-school').addEventListener('input', (ev) => {
      state.project.meta.school = ev.target.value;
      saveToLocalStorage();
    });
    $('#meta-date').addEventListener('input', (ev) => {
      state.project.meta.date = ev.target.value;
      saveToLocalStorage();
    });
    $('#meta-note').addEventListener('input', (ev) => {
      state.project.meta.psychologistNote = ev.target.value;
      saveToLocalStorage();
    });

    // Přidání žáka
    $('#form-add-student').addEventListener('submit', (ev) => {
      ev.preventDefault();
      const nameInp = $('#input-student-name');
      const genderSel = $('#input-student-gender');
      const name = nameInp.value.trim();
      if (!name) return;

      state.project.students.push({
        id: nextStudentId(state.project.students),
        code: nextStudentCode(state.project.students),
        name,
        gender: genderSel.value,
      });
      nameInp.value = '';
      recompute();
      nameInp.focus();
    });

    // Hromadné přidání žáků
    $('#btn-toggle-bulk').addEventListener('click', () => {
      $('#bulk-add-box').classList.toggle('hidden');
      $('#bulk-names-textarea').focus();
    });
    $('#btn-bulk-cancel').addEventListener('click', () => {
      $('#bulk-add-box').classList.add('hidden');
    });
    $('#btn-bulk-confirm').addEventListener('click', () => {
      const lines = $('#bulk-names-textarea')
        .value.split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      if (lines.length === 0) return;
      lines.forEach((name) => {
        state.project.students.push({
          id: nextStudentId(state.project.students),
          code: nextStudentCode(state.project.students),
          name,
          gender: 'O',
        });
      });
      $('#bulk-names-textarea').value = '';
      $('#bulk-add-box').classList.add('hidden');
      recompute();
      showToast(`Přidáno ${lines.length} žáků.`, 'success');
    });

    // Přepínání režimu zadávání
    $$('[data-entry-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.entryMode = btn.dataset.entryMode;
        renderMatrixTab();
      });
    });

    // Výběr hodnotitele v archu
    $('#select-rater').addEventListener('change', (ev) => {
      state.selectedRaterId = ev.target.value;
      renderEntrySheet();
    });
    $('#btn-prev-rater').addEventListener('click', () => {
      const list = state.project.students;
      const idx = list.findIndex((s) => s.id === state.selectedRaterId);
      if (idx > 0) {
        state.selectedRaterId = list[idx - 1].id;
        renderEntrySheet();
      }
    });
    $('#btn-next-rater').addEventListener('click', () => {
      const list = state.project.students;
      const idx = list.findIndex((s) => s.id === state.selectedRaterId);
      if (idx >= 0 && idx < list.length - 1) {
        state.selectedRaterId = list[idx + 1].id;
        renderEntrySheet();
      }
    });

    // CSV import matic
    $('#btn-csv-import-inf').addEventListener('click', () => {
      state.csvImportDimension = 'influence';
      $('#hidden-csv-input').click();
    });
    $('#btn-csv-import-sym').addEventListener('click', () => {
      state.csvImportDimension = 'sympathy';
      $('#hidden-csv-input').click();
    });
    $('#hidden-csv-input').addEventListener('change', async (ev) => {
      const file = ev.target.files[0];
      ev.target.value = '';
      if (!file) return;
      try {
        const text = await file.text();
        const count = SocioEngine.importMatrixFromCSV(
          state.project,
          state.csvImportDimension,
          text
        );
        recompute();
        showToast(
          `Importováno ${count} hodnot (${
            state.csvImportDimension === 'influence' ? 'vliv' : 'sympatie'
          }).`,
          'success'
        );
      } catch (err) {
        showToast(err.message || 'Chyba importu CSV.', 'error');
      }
    });

    // Nastavení analýzy
    $('#opt-threshold-mode').addEventListener('change', (ev) => {
      state.options.thresholdMode = ev.target.value;
      recompute(false);
    });
    $('#opt-sympathy-max').addEventListener('change', (ev) => {
      state.options.mutualSympathyMax = Number(ev.target.value);
      recompute(false);
    });
    $('#opt-antipathy-min').addEventListener('change', (ev) => {
      state.options.mutualAntipathyMin = Number(ev.target.value);
      recompute(false);
    });

    // Řazení tabulky výsledků
    $$('#results-table th[data-sort]').forEach((th) => {
      th.addEventListener('click', () => {
        const key = th.dataset.sort;
        if (state.sortKey === key) state.sortAsc = !state.sortAsc;
        else {
          state.sortKey = key;
          state.sortAsc = true;
        }
        renderOverviewTab();
      });
    });

    // Ovládání sociogramu
    $$('[data-socio-layout]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.socioLayout = btn.dataset.socioLayout;
        renderSociogramTab();
      });
    });
    $('#flt-mutual-sym').addEventListener('change', (ev) => {
      state.socioFilters.mutualSym = ev.target.checked;
      renderSociogramTab();
    });
    $('#flt-uni-sym').addEventListener('change', (ev) => {
      state.socioFilters.uniSym = ev.target.checked;
      renderSociogramTab();
    });
    $('#flt-mutual-anti').addEventListener('change', (ev) => {
      state.socioFilters.mutualAnti = ev.target.checked;
      renderSociogramTab();
    });
    $('#flt-uni-anti').addEventListener('change', (ev) => {
      state.socioFilters.uniAnti = ev.target.checked;
      renderSociogramTab();
    });
    $('#btn-clear-socio-focus').addEventListener('click', () => {
      state.socioFocusedId = null;
      renderSociogramTab();
    });

    // Export grafů
    $('#btn-export-scatter-svg').addEventListener('click', () => {
      SocioCharts.downloadSvg(state.lastScatterSvg, `${getSafeFilenameBase()}-pozicni-graf.svg`);
    });
    $('#btn-export-scatter-png').addEventListener('click', () => {
      SocioCharts.downloadSvgAsPng(
        state.lastScatterSvg,
        `${getSafeFilenameBase()}-pozicni-graf.png`
      );
    });
    $('#btn-export-socio-svg').addEventListener('click', () => {
      SocioCharts.downloadSvg(state.lastSocioSvg, `${getSafeFilenameBase()}-sociogram.svg`);
    });
    $('#btn-export-socio-png').addEventListener('click', () => {
      SocioCharts.downloadSvgAsPng(state.lastSocioSvg, `${getSafeFilenameBase()}-sociogram.png`);
    });

    // Report tisk
    $('#rep-include-comments').addEventListener('change', (ev) => {
      state.reportIncludeComments = ev.target.checked;
      renderReportTab();
    });
    $('#btn-print-report').addEventListener('click', () => {
      window.print();
    });

    // Načíst soubor
    $('#btn-open-file').addEventListener('click', () => $('#hidden-file-input').click());
    $('#hidden-file-input').addEventListener('change', (ev) => {
      const f = ev.target.files[0];
      ev.target.value = '';
      handleFileOpen(f);
    });

    // Modály
    $('#btn-open-save-modal').addEventListener('click', () => {
      $('#modal-save').classList.remove('hidden');
    });
    $('#btn-close-save-modal').addEventListener('click', () => {
      $('#modal-save').classList.add('hidden');
    });
    $('#btn-close-student-modal').addEventListener('click', () => {
      $('#modal-student').classList.add('hidden');
    });

    [$('#modal-save'), $('#modal-student')].forEach((backdrop) => {
      backdrop.addEventListener('click', (ev) => {
        if (ev.target === backdrop) backdrop.classList.add('hidden');
      });
    });

    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') {
        $('#modal-save').classList.add('hidden');
        $('#modal-student').classList.add('hidden');
      }
    });

    // Akce v modálu Uložit / Export
    $('#btn-export-encrypted').addEventListener('click', async () => {
      const pass = $('#input-encrypt-pass').value;
      try {
        const enc = await SocioCrypto.encryptProject(state.project, pass);
        const blob = new Blob([enc], { type: 'application/json;charset=utf-8' });
        SocioCharts.triggerDownload(blob, `${getSafeFilenameBase()}.socioenc`);
        $('#input-encrypt-pass').value = '';
        showToast('Zašifrovaný soubor (.socioenc) byl stažen.', 'success');
      } catch (err) {
        showToast(err.message || 'Chyba šifrování.', 'error');
      }
    });

    $('#btn-export-json').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(state.project, null, 2)], {
        type: 'application/json;charset=utf-8',
      });
      SocioCharts.triggerDownload(blob, `${getSafeFilenameBase()}.json`);
      showToast('Projekt (.json) byl stažen.', 'success');
    });

    $('#btn-export-csv-inf').addEventListener('click', () => {
      const csv = SocioEngine.exportMatrixToCSV(state.project, 'influence');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      SocioCharts.triggerDownload(blob, `${getSafeFilenameBase()}-vliv.csv`);
      showToast('CSV matice vlivu byla stažena.', 'success');
    });

    $('#btn-export-csv-sym').addEventListener('click', () => {
      const csv = SocioEngine.exportMatrixToCSV(state.project, 'sympathy');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      SocioCharts.triggerDownload(blob, `${getSafeFilenameBase()}-sympatie.csv`);
      showToast('CSV matice sympatií byla stažena.', 'success');
    });

    $('#btn-wipe-storage').addEventListener('click', () => {
      if (!confirm('Opravdu vymazat všechna lokálně uložená data z tohoto prohlížeče?')) return;
      localStorage.removeItem(STORAGE_KEY);
      state.project = SocioEngine.createEmptyProject();
      state.socioCustomPositions.clear();
      $('#modal-save').classList.add('hidden');
      recompute(false);
      showToast('Lokální paměť prohlížeče byla vymazána.', 'success');
    });
  }

  // Inicializace po načtení DOM
  document.addEventListener('DOMContentLoaded', () => {
    state.project = loadInitialProject();
    bindEvents();
    recompute(false);
  });
})();
