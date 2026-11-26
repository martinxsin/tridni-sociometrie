/**
 * Třídní sociometrie – Výpočetní jádro (sociometricko-ratingová metoda)
 *
 * Čistá JavaScript knihovna bez externích závislostí.
 * Funguje jak v prohlížeči (window.SocioEngine), tak v Node.js (module.exports).
 *
 * Škály (1–5, podobně jako školní známkování):
 * - Vliv:     1 = největší vliv, 5 = žádný vliv (nižší průměr = vyšší vliv)
 * - Sympatie: 1 = velmi sympatický/á, 5 = velmi nesympatický/á (nižší průměr = vyšší obliba)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SocioEngine = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DEFAULT_SCALE_LABELS = {
    influence: {
      1: 'Velmi velký vliv',
      2: 'Velký vliv',
      3: 'Průměrný vliv',
      4: 'Malý vliv',
      5: 'Žádný vliv',
    },
    sympathy: {
      1: 'Velmi sympatický/á',
      2: 'Sympatický/á',
      3: 'Neutrální',
      4: 'Spíše nesympatický/á',
      5: 'Nesympatický/á',
    },
  };

  /**
   * Vytvoří prázdnou strukturu projektu třídy.
   */
  function createEmptyProject(overrides = {}) {
    return {
      version: 1,
      meta: {
        className: overrides.className || 'Nová třída',
        school: overrides.school || '',
        date: overrides.date || new Date().toISOString().slice(0, 10),
        psychologistNote: overrides.psychologistNote || '',
        conclusion: overrides.conclusion || '',
      },
      scaleLabels: JSON.parse(JSON.stringify(DEFAULT_SCALE_LABELS)),
      students: [], // [{ id, code, name, gender: 'F'|'M'|'O' }]
      // ratings[raterId][targetId] = { influence: 1..5|null, sympathy: 1..5|null, comment: string }
      ratings: {},
    };
  }

  /**
   * Bezpečně přečte hodnotu hodnocení (1..5 nebo null).
   */
  function getRating(project, raterId, targetId) {
    if (!project || !project.ratings || raterId === targetId) {
      return { influence: null, sympathy: null, comment: '' };
    }
    const row = project.ratings[raterId];
    if (!row || !row[targetId]) {
      return { influence: null, sympathy: null, comment: '' };
    }
    const cell = row[targetId];
    return {
      influence: isValidScore(cell.influence) ? Number(cell.influence) : null,
      sympathy: isValidScore(cell.sympathy) ? Number(cell.sympathy) : null,
      comment: typeof cell.comment === 'string' ? cell.comment : '',
    };
  }

  function isValidScore(v) {
    if (v === null || v === undefined || v === '') return false;
    const n = Number(v);
    return Number.isInteger(n) && n >= 1 && n <= 5;
  }

  function mean(values) {
    if (!values.length) return null;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  function stdDev(values) {
    if (values.length < 2) return 0;
    const m = mean(values);
    const variance = values.reduce((sum, v) => sum + Math.pow(v - m, 2), 0) / values.length;
    return Math.sqrt(variance);
  }

  function round(value, decimals = 2) {
    if (value === null || value === undefined || Number.isNaN(value)) return null;
    const f = Math.pow(10, decimals);
    return Math.round(value * f) / f;
  }

  /**
   * Klasifikuje žáka do jednoho ze 4 kvadrantů (a volitelného středu / nedostatečných dat).
   * Nižší skóre = vyšší vliv / vyšší obliba.
   */
  function classifyQuadrant(influenceIndex, sympathyIndex, influenceThreshold, sympathyThreshold) {
    if (influenceIndex === null || sympathyIndex === null) {
      return {
        id: 'unknown',
        label: 'Nedostatek dat',
        shortLabel: 'Bez dat',
        color: '#64748b',
        description: 'Chybí dostatečný počet hodnocení od spolužáků.',
      };
    }

    const highInfluence = influenceIndex <= influenceThreshold;
    const highSympathy = sympathyIndex <= sympathyThreshold;

    if (highInfluence && highSympathy) {
      return {
        id: 'leader_popular',
        label: 'Vůdčí a oblíbený/á',
        shortLabel: 'Vůdce (oblíbený)',
        color: '#059669',
        description: 'Vysoký vliv i vysoká obliba – přirozená pozitivní autorita ve třídě.',
      };
    }
    if (highInfluence && !highSympathy) {
      return {
        id: 'leader_unpopular',
        label: 'Vlivný/á, ale neoblíbený/á',
        shortLabel: 'Vlivný (neoblíbený)',
        color: '#d97706',
        description: 'Silný vliv při nižší oblibě – může jít o obávanou, direktivní či konfliktní osobnost.',
      };
    }
    if (!highInfluence && highSympathy) {
      return {
        id: 'popular_low_influence',
        label: 'Oblíbený/á, menší vliv',
        shortLabel: 'Oblíbený',
        color: '#2563eb',
        description: 'Dobře přijímaný a oblíbený žák bez výrazné potřeby třídu vést.',
      };
    }
    return {
      id: 'isolated_at_risk',
      label: 'Izolovaný/á / ohrožený/á',
      shortLabel: 'Ohrožený / okraj',
      color: '#dc2626',
      description: 'Nízký vliv i nízká obliba – zvýšené riziko vyčlenění z kolektivu nebo šikany.',
    };
  }

  /**
   * Detekce maximálních klik (Bron–Kerbosch algoritmus) v neorientovaném grafu vzájemných sympatií.
   * Vrací kliky velikosti >= 3 (skupinky) a izolované dvojice (velikost 2).
   */
  function findCliques(nodeIds, adjacencyMap) {
    const cliques = [];

    function bronKerbosch(R, P, X) {
      if (P.size === 0 && X.size === 0) {
        if (R.size >= 2) {
          cliques.push(Array.from(R));
        }
        return;
      }

      // Pivot výběr pro rychlost
      let pivot = null;
      let maxDeg = -1;
      for (const u of new Set([...P, ...X])) {
        const neighbors = adjacencyMap.get(u) || new Set();
        let deg = 0;
        for (const p of P) {
          if (neighbors.has(p)) deg++;
        }
        if (deg > maxDeg) {
          maxDeg = deg;
          pivot = u;
        }
      }

      const pivotNeighbors = pivot !== null ? (adjacencyMap.get(pivot) || new Set()) : new Set();
      const candidates = Array.from(P).filter((v) => !pivotNeighbors.has(v));

      for (const v of candidates) {
        const neighbors = adjacencyMap.get(v) || new Set();
        const nextR = new Set(R);
        nextR.add(v);
        const nextP = new Set(Array.from(P).filter((u) => neighbors.has(u)));
        const nextX = new Set(Array.from(X).filter((u) => neighbors.has(u)));
        bronKerbosch(nextR, nextP, nextX);
        P.delete(v);
        X.add(v);
      }
    }

    bronKerbosch(new Set(), new Set(nodeIds), new Set());

    // Seřadit od největších klik
    cliques.sort((a, b) => b.length - a.length);
    return {
      groups: cliques.filter((c) => c.length >= 3),
      pairs: cliques.filter((c) => c.length === 2),
    };
  }

  /**
   * Kompletní analýza projektu.
   * options:
   *  - thresholdMode: 'fixed' (3.0) | 'mean' (průměr třídy)
   *  - mutualSympathyMax: 2 (výchozí: oba dali 1 nebo 2) nebo 1 (jen velmi silné)
   *  - mutualAntipathyMin: 4 (výchozí: oba dali 4 nebo 5) nebo 5
   */
  function analyze(project, options = {}) {
    const thresholdMode = options.thresholdMode || 'fixed';
    const mutualSympathyMax = options.mutualSympathyMax || 2;
    const mutualAntipathyMin = options.mutualAntipathyMin || 4;

    const students = project.students || [];
    const n = students.length;
    const maxCells = n * Math.max(0, n - 1);

    let filledInfluence = 0;
    let filledSympathy = 0;
    const allInfluenceValues = [];
    const allSympathyValues = [];

    // 1. Sběr základních metrik po žácích
    const perStudentRaw = students.map((student) => {
      const receivedInfluence = [];
      const receivedSympathy = [];
      const givenInfluence = [];
      const givenSympathy = [];
      const commentsReceived = [];

      let posSympathyReceived = 0; // 1 nebo 2
      let strongPosReceived = 0;   // 1
      let negSympathyReceived = 0; // 4 nebo 5
      let strongNegReceived = 0;   // 5

      for (const other of students) {
        if (other.id === student.id) continue;

        // Jak ostatní hodnotí tohoto žáka
        const incoming = getRating(project, other.id, student.id);
        if (incoming.influence !== null) {
          receivedInfluence.push(incoming.influence);
          allInfluenceValues.push(incoming.influence);
          filledInfluence++;
        }
        if (incoming.sympathy !== null) {
          receivedSympathy.push(incoming.sympathy);
          allSympathyValues.push(incoming.sympathy);
          filledSympathy++;
          if (incoming.sympathy <= 2) posSympathyReceived++;
          if (incoming.sympathy === 1) strongPosReceived++;
          if (incoming.sympathy >= 4) negSympathyReceived++;
          if (incoming.sympathy === 5) strongNegReceived++;
        }
        if (incoming.comment && incoming.comment.trim()) {
          commentsReceived.push({
            fromId: other.id,
            fromCode: other.code,
            fromName: other.name,
            sympathy: incoming.sympathy,
            influence: incoming.influence,
            text: incoming.comment.trim(),
          });
        }

        // Jak tento žák hodnotí ostatní
        const outgoing = getRating(project, student.id, other.id);
        if (outgoing.influence !== null) givenInfluence.push(outgoing.influence);
        if (outgoing.sympathy !== null) givenSympathy.push(outgoing.sympathy);
      }

      return {
        student,
        influenceIndex: mean(receivedInfluence),
        influenceStdDev: stdDev(receivedInfluence),
        sympathyIndex: mean(receivedSympathy),
        sympathyStdDev: stdDev(receivedSympathy),
        givenInfluenceMean: mean(givenInfluence),
        givenSympathyMean: mean(givenSympathy),
        receivedInfluenceCount: receivedInfluence.length,
        receivedSympathyCount: receivedSympathy.length,
        posSympathyReceived,
        strongPosReceived,
        negSympathyReceived,
        strongNegReceived,
        commentsReceived,
        mutualSympathies: [],
        mutualAntipathies: [],
        unilateralSympathiesIn: [],
        unilateralSympathiesOut: [],
        unilateralAntipathiesIn: [],
        unilateralAntipathiesOut: [],
      };
    });

    const studentStatsMap = new Map(perStudentRaw.map((s) => [s.student.id, s]));

    // 2. Párové vztahy (hrany sociogramu) a matice sousednosti pro kliky
    const edges = [];
    const mutualSympathyAdj = new Map(students.map((s) => [s.id, new Set()]));
    let mutualSympathyPairs = 0;
    let mutualAntipathyPairs = 0;
    let totalEvaluatedPairs = 0;

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = students[i];
        const b = students[j];
        const ab = getRating(project, a.id, b.id).sympathy;
        const ba = getRating(project, b.id, a.id).sympathy;

        if (ab !== null && ba !== null) {
          totalEvaluatedPairs++;
        }

        const aLikesB = ab !== null && ab <= mutualSympathyMax;
        const bLikesA = ba !== null && ba <= mutualSympathyMax;
        const aDislikesB = ab !== null && ab >= mutualAntipathyMin;
        const bDislikesA = ba !== null && ba >= mutualAntipathyMin;

        const statA = studentStatsMap.get(a.id);
        const statB = studentStatsMap.get(b.id);

        if (aLikesB && bLikesA) {
          mutualSympathyPairs++;
          mutualSympathyAdj.get(a.id).add(b.id);
          mutualSympathyAdj.get(b.id).add(a.id);
          statA.mutualSympathies.push({ id: b.id, ab, ba });
          statB.mutualSympathies.push({ id: a.id, ab: ba, ba: ab });
          edges.push({
            source: a.id,
            target: b.id,
            type: 'mutual_sympathy',
            strength: ab === 1 && ba === 1 ? 'strong' : 'normal',
            scoreAB: ab,
            scoreBA: ba,
          });
        } else {
          if (aLikesB) {
            statA.unilateralSympathiesOut.push({ id: b.id, score: ab });
            statB.unilateralSympathiesIn.push({ id: a.id, score: ab });
            edges.push({
              source: a.id,
              target: b.id,
              type: 'unilateral_sympathy',
              strength: ab === 1 ? 'strong' : 'normal',
              scoreAB: ab,
              scoreBA: ba,
            });
          }
          if (bLikesA) {
            statB.unilateralSympathiesOut.push({ id: a.id, score: ba });
            statA.unilateralSympathiesIn.push({ id: b.id, score: ba });
            edges.push({
              source: b.id,
              target: a.id,
              type: 'unilateral_sympathy',
              strength: ba === 1 ? 'strong' : 'normal',
              scoreAB: ba,
              scoreBA: ab,
            });
          }
        }

        if (aDislikesB && bDislikesA) {
          mutualAntipathyPairs++;
          statA.mutualAntipathies.push({ id: b.id, ab, ba });
          statB.mutualAntipathies.push({ id: a.id, ab: ba, ba: ab });
          edges.push({
            source: a.id,
            target: b.id,
            type: 'mutual_antipathy',
            strength: ab === 5 && ba === 5 ? 'strong' : 'normal',
            scoreAB: ab,
            scoreBA: ba,
          });
        } else {
          if (aDislikesB) {
            statA.unilateralAntipathiesOut.push({ id: b.id, score: ab });
            statB.unilateralAntipathiesIn.push({ id: a.id, score: ab });
            edges.push({
              source: a.id,
              target: b.id,
              type: 'unilateral_antipathy',
              strength: ab === 5 ? 'strong' : 'normal',
              scoreAB: ab,
              scoreBA: ba,
            });
          }
          if (bDislikesA) {
            statB.unilateralAntipathiesOut.push({ id: a.id, score: ba });
            statA.unilateralAntipathiesIn.push({ id: b.id, score: ba });
            edges.push({
              source: b.id,
              target: a.id,
              type: 'unilateral_antipathy',
              strength: ba === 5 ? 'strong' : 'normal',
              scoreAB: ba,
              scoreBA: ab,
            });
          }
        }
      }
    }

    // 3. Třídní ukazatele
    const classInfluenceMean = mean(allInfluenceValues);
    const classSympathyMean = mean(allSympathyValues);

    const studentInfluenceMeans = perStudentRaw
      .map((s) => s.influenceIndex)
      .filter((v) => v !== null);
    const studentSympathyMeans = perStudentRaw
      .map((s) => s.sympathyIndex)
      .filter((v) => v !== null);

    const influenceDispersion = stdDev(studentInfluenceMeans);
    const sympathyDispersion = stdDev(studentSympathyMeans);

    const influenceThreshold =
      thresholdMode === 'mean' && classInfluenceMean !== null ? classInfluenceMean : 3.0;
    const sympathyThreshold =
      thresholdMode === 'mean' && classSympathyMean !== null ? classSympathyMean : 3.0;

    // 4. Typologie a rizikové příznaky
    const studentResults = perStudentRaw.map((s) => {
      const quadrant = classifyQuadrant(
        s.influenceIndex,
        s.sympathyIndex,
        influenceThreshold,
        sympathyThreshold
      );

      const riskFlags = [];
      if (s.sympathyIndex !== null && s.sympathyIndex >= 3.6) {
        riskFlags.push('Vysoká míra odmítání');
      }
      if (s.receivedSympathyCount >= 3 && s.mutualSympathies.length === 0) {
        riskFlags.push('Bez vzájemné sympatie');
      }
      if (
        s.receivedSympathyCount >= 3 &&
        s.negSympathyReceived / s.receivedSympathyCount >= 0.45
      ) {
        riskFlags.push('Časté negativní hodnocení (4–5)');
      }
      if (quadrant.id === 'leader_unpopular') {
        riskFlags.push('Dominantní / konfliktní pozice');
      }

      return {
        ...s,
        influenceIndexRounded: round(s.influenceIndex, 2),
        sympathyIndexRounded: round(s.sympathyIndex, 2),
        givenSympathyMeanRounded: round(s.givenSympathyMean, 2),
        quadrant,
        riskFlags,
      };
    });

    // 5. Detekce klik a sociálně izolovaných
    const cliques = findCliques(
      students.map((s) => s.id),
      mutualSympathyAdj
    );
    const isolatedByMutual = studentResults
      .filter((s) => s.receivedSympathyCount > 0 && s.mutualSympathies.length === 0)
      .map((s) => s.student.id);

    // 6. Koheze (podíl vzájemných pozitivních dvojic ze všech hodnocených dvojic)
    const possiblePairs = (n * Math.max(0, n - 1)) / 2;
    const cohesionIndex =
      totalEvaluatedPairs > 0 ? mutualSympathyPairs / totalEvaluatedPairs : null;

    // Slovní interpretace klimatu
    const climateSummary = interpretClassClimate({
      classSympathyMean,
      classInfluenceMean,
      influenceDispersion,
      cohesionIndex,
      studentResults,
      mutualAntipathyPairs,
    });

    const quadrantCounts = {
      leader_popular: 0,
      leader_unpopular: 0,
      popular_low_influence: 0,
      isolated_at_risk: 0,
      unknown: 0,
    };
    for (const sr of studentResults) {
      quadrantCounts[sr.quadrant.id] = (quadrantCounts[sr.quadrant.id] || 0) + 1;
    }

    return {
      studentCount: n,
      completeness: {
        influence: maxCells > 0 ? filledInfluence / maxCells : 0,
        sympathy: maxCells > 0 ? filledSympathy / maxCells : 0,
        filledInfluence,
        filledSympathy,
        maxCells,
      },
      thresholds: {
        mode: thresholdMode,
        influence: round(influenceThreshold, 2),
        sympathy: round(sympathyThreshold, 2),
      },
      classMetrics: {
        influenceMean: round(classInfluenceMean, 2),
        sympathyMean: round(classSympathyMean, 2),
        influenceDispersion: round(influenceDispersion, 2),
        sympathyDispersion: round(sympathyDispersion, 2),
        cohesionIndex: cohesionIndex !== null ? round(cohesionIndex * 100, 1) : null, // v %
        mutualSympathyPairs,
        mutualAntipathyPairs,
        possiblePairs,
        totalEvaluatedPairs,
        quadrantCounts,
        atRiskCount: studentResults.filter((s) => s.riskFlags.length > 0).length,
      },
      climateSummary,
      students: studentResults,
      edges,
      cliques: {
        groups: cliques.groups,
        pairs: cliques.pairs,
        isolatedIds: isolatedByMutual,
      },
    };
  }

  function interpretClassClimate({
    classSympathyMean,
    influenceDispersion,
    cohesionIndex,
    studentResults,
    mutualAntipathyPairs,
  }) {
    if (classSympathyMean === null) {
      return {
        atmosphereLabel: 'Zatím bez dat',
        atmosphereLevel: 'neutral',
        cohesionLabel: 'Zatím bez dat',
        notes: ['Zadejte hodnocení do matic vlivu a sympatií pro zobrazení interpretace.'],
      };
    }

    let atmosphereLabel = 'Vyvážené / průměrné klima';
    let atmosphereLevel = 'neutral';
    if (classSympathyMean <= 2.35) {
      atmosphereLabel = 'Velmi příznivé a přátelské klima';
      atmosphereLevel = 'good';
    } else if (classSympathyMean <= 2.75) {
      atmosphereLabel = 'Spíše příznivé klima';
      atmosphereLevel = 'good';
    } else if (classSympathyMean >= 3.35) {
      atmosphereLabel = 'Napjaté / rizikové klima';
      atmosphereLevel = 'danger';
    } else if (classSympathyMean >= 3.05) {
      atmosphereLabel = 'Mírně zhoršené klima';
      atmosphereLevel = 'warn';
    }

    let cohesionLabel = 'Střední soudržnost';
    if (cohesionIndex !== null) {
      if (cohesionIndex >= 0.35) cohesionLabel = 'Vysoká soudržnost kolektivu';
      else if (cohesionIndex < 0.15) cohesionLabel = 'Nízká soudržnost / roztříštěný kolektiv';
    }

    const notes = [];
    if (influenceDispersion >= 0.85) {
      notes.push(
        'Vliv je ve třídě výrazně nerovnoměrně rozložený (silná hierarchie mezi vůdci a okrajem).'
      );
    } else if (influenceDispersion <= 0.45 && studentResults.length >= 5) {
      notes.push('Vliv je mezi žáky rozložený poměrně rovnoměrně bez extrémní dominance.');
    }

    const isolated = studentResults.filter((s) => s.quadrant.id === 'isolated_at_risk');
    if (isolated.length > 0) {
      notes.push(
        `V rizikovém kvadrantu (nízký vliv, nízká obliba) se nachází ${isolated.length} ${
          isolated.length === 1 ? 'žák' : isolated.length < 5 ? 'žáci' : 'žáků'
        } – doporučuje se bližší pozornost.`
      );
    }

    const dominantUnpopular = studentResults.filter((s) => s.quadrant.id === 'leader_unpopular');
    if (dominantUnpopular.length > 0) {
      notes.push(
        `Zjištěni vlivní, ale neoblíbení žáci (${dominantUnpopular.length}) – vhodné ověřit, zda nedochází k mocenskému tlaku či šikaně.`
      );
    }

    if (mutualAntipathyPairs > 0) {
      notes.push(
        `Ve třídě je ${mutualAntipathyPairs} ${
          mutualAntipathyPairs === 1
            ? 'oboustranný konflikt (vzájemná antipatie)'
            : mutualAntipathyPairs < 5
            ? 'oboustranné konflikty (vzájemné antipatie)'
            : 'oboustranných konfliktů (vzájemných antipatií)'
        }.`
      );
    }

    return {
      atmosphereLabel,
      atmosphereLevel,
      cohesionLabel,
      notes,
    };
  }

  /**
   * Převod matice (influence nebo sympathy) do CSV (oddělovač středník pro český Excel).
   */
  function exportMatrixToCSV(project, dimension) {
    const students = project.students || [];
    const header = ['Hodnotitel \\ Hodnocený', ...students.map((s) => `${s.code} ${s.name}`)];
    const rows = [header.map(escapeCsv).join(';')];

    for (const rater of students) {
      const cells = [`${rater.code} ${rater.name}`];
      for (const target of students) {
        if (rater.id === target.id) {
          cells.push('-');
        } else {
          const r = getRating(project, rater.id, target.id);
          const val = dimension === 'influence' ? r.influence : r.sympathy;
          cells.push(val !== null ? String(val) : '');
        }
      }
      rows.push(cells.map(escapeCsv).join(';'));
    }

    return '\uFEFF' + rows.join('\r\n');
  }

  function escapeCsv(str) {
    const s = String(str ?? '');
    if (s.includes(';') || s.includes(',') || s.includes('"') || s.includes('\n')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  /**
   * Načte matici z CSV (podporuje středník i čárku, automaticky rozpozná žáky ze záhlaví nebo namapuje na stávající).
   */
  function importMatrixFromCSV(project, dimension, csvText) {
    const cleaned = csvText.replace(/^\uFEFF/, '').trim();
    if (!cleaned) throw new Error('Soubor CSV je prázdný.');

    const lines = cleaned.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) {
      throw new Error('CSV musí obsahovat hlavičku a alespoň jeden řádek.');
    }

    const delimiter = lines[0].includes(';') ? ';' : ',';
    const parseLine = (line) => {
      const res = [];
      let cur = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          if (inQuotes && line[i + 1] === '"') {
            cur += '"';
            i++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (ch === delimiter && !inQuotes) {
          res.push(cur.trim());
          cur = '';
        } else {
          cur += ch;
        }
      }
      res.push(cur.trim());
      return res;
    };

    const headerCells = parseLine(lines[0]).slice(1);
    if (headerCells.length < 2) {
      throw new Error('V hlavičce CSV nebylo nalezeno dostatek žáků.');
    }

    // Pokud je projekt prázdný, vytvoříme žáky podle hlavičky
    if (project.students.length === 0) {
      headerCells.forEach((rawLabel, idx) => {
        const match = rawLabel.match(/^(Ž\d+)\s+(.+)$/i);
        const code = match ? match[1].toUpperCase() : `Ž${String(idx + 1).padStart(2, '0')}`;
        const name = match ? match[2].trim() : rawLabel;
        project.students.push({
          id: `s_${idx + 1}`,
          code,
          name,
          gender: 'O',
        });
      });
    }

    const students = project.students;
    if (headerCells.length !== students.length) {
      throw new Error(
        `Počet sloupců v CSV (${headerCells.length}) neodpovídá počtu žáků ve třídě (${students.length}).`
      );
    }

    let importedCount = 0;
    for (let r = 1; r < lines.length && r - 1 < students.length; r++) {
      const rowCells = parseLine(lines[r]).slice(1);
      const rater = students[r - 1];
      if (!project.ratings[rater.id]) project.ratings[rater.id] = {};

      for (let c = 0; c < students.length && c < rowCells.length; c++) {
        const target = students[c];
        if (rater.id === target.id) continue;
        const val = rowCells[c];
        if (val === '' || val === '-') continue;
        const num = Number(val);
        if (isValidScore(num)) {
          if (!project.ratings[rater.id][target.id]) {
            project.ratings[rater.id][target.id] = {
              influence: null,
              sympathy: null,
              comment: '',
            };
          }
          project.ratings[rater.id][target.id][dimension] = num;
          importedCount++;
        }
      }
    }

    return importedCount;
  }

  return {
    DEFAULT_SCALE_LABELS,
    createEmptyProject,
    getRating,
    isValidScore,
    classifyQuadrant,
    findCliques,
    analyze,
    exportMatrixToCSV,
    importMatrixFromCSV,
    round,
  };
});
