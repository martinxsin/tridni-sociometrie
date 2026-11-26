/**
 * Realistická ukázková třída (8.B – 14 žáků) pro okamžité vyzkoušení všech funkcí aplikace.
 * Obsahuje:
 * - Přirozené vůdce (Klára, Jakub)
 * - Dvě silné přátelské skupinky (kliky) + propojující žáky
 * - Dominantního, ale méně oblíbeného žáka (Dominik – riziko konfliktního chování)
 * - Izolovaného / ohroženého žáka (Matěj – nízký vliv, nízká obliba, bez vzájemných sympatií)
 * - Ukázkové slovní komentáře spolužáků
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SocioSampleData = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function createSampleProject() {
    const students = [
      { id: 's_1', code: 'Ž01', name: 'Klára Novotná', gender: 'F' },      // Přirozená vůdkyně (klika A)
      { id: 's_2', code: 'Ž02', name: 'Jakub Dvořák', gender: 'M' },       // Přirozený vůdce (klika B)
      { id: 's_3', code: 'Ž03', name: 'Tereza Svobodová', gender: 'F' },   // Oblíbená, klika A
      { id: 's_4', code: 'Ž04', name: 'Adéla Králová', gender: 'F' },      // Oblíbená, klika A
      { id: 's_5', code: 'Ž05', name: 'Lukáš Marek', gender: 'M' },        // Oblíbený, klika B
      { id: 's_6', code: 'Ž06', name: 'Ondřej Veselý', gender: 'M' },      // Oblíbený, klika B
      { id: 's_7', code: 'Ž07', name: 'Dominik Černý', gender: 'M' },      // Vysoký vliv, nízká obliba!
      { id: 's_8', code: 'Ž08', name: 'Eliška Pokorná', gender: 'F' },     // Klidná, oblíbená, menší vliv
      { id: 's_9', code: 'Ž09', name: 'Filip Horák', gender: 'M' },        // Blízko Dominikovi, průměr
      { id: 's_10', code: 'Ž10', name: 'Natálie Benešová', gender: 'F' },  // Propojovatelka, oblíbená
      { id: 's_11', code: 'Ž11', name: 'Štěpán Kříž', gender: 'M' },       // Tišší, dvojice s Davidem
      { id: 's_12', code: 'Ž12', name: 'David Procházka', gender: 'M' },   // Tišší, dvojice se Štěpánem
      { id: 's_13', code: 'Ž13', name: 'Veronika Malá', gender: 'F' },     // Spíše okraj, má jednu vazbu
      { id: 's_14', code: 'Ž14', name: 'Matěj Jelínek', gender: 'M' },     // Izolovaný / ohrožený žák!
    ];

    // Matice vlivu (14x14): řádek = hodnotitel, sloupec = hodnocený, 0 = diagonála
    const influenceMatrix = [
      //  1  2  3  4  5  6  7  8  9 10 11 12 13 14
      [  0, 1, 2, 2, 2, 3, 2, 3, 3, 2, 4, 4, 4, 5], // Ž01 Klára
      [  1, 0, 2, 3, 2, 2, 2, 4, 3, 3, 4, 4, 4, 5], // Ž02 Jakub
      [  1, 2, 0, 2, 3, 3, 2, 3, 3, 2, 4, 4, 4, 5], // Ž03 Tereza
      [  1, 2, 2, 0, 3, 3, 1, 4, 3, 3, 4, 4, 5, 5], // Ž04 Adéla
      [  2, 1, 3, 3, 0, 2, 2, 4, 2, 3, 4, 4, 4, 5], // Ž05 Lukáš
      [  2, 1, 3, 3, 2, 0, 2, 4, 3, 3, 4, 3, 4, 5], // Ž06 Ondřej
      [  2, 2, 3, 3, 3, 3, 0, 4, 2, 3, 5, 5, 5, 5], // Ž07 Dominik
      [  1, 2, 2, 2, 3, 3, 1, 0, 3, 2, 4, 4, 4, 5], // Ž08 Eliška
      [  2, 2, 3, 3, 2, 3, 1, 4, 0, 3, 4, 4, 5, 5], // Ž09 Filip
      [  1, 1, 2, 2, 2, 3, 2, 3, 3, 0, 4, 4, 4, 5], // Ž10 Natálie
      [  2, 2, 3, 3, 3, 3, 2, 4, 3, 3, 0, 3, 4, 5], // Ž11 Štěpán
      [  2, 2, 3, 3, 3, 3, 2, 4, 3, 3, 3, 0, 4, 5], // Ž12 David
      [  1, 2, 2, 3, 3, 3, 2, 3, 3, 2, 4, 4, 0, 4], // Ž13 Veronika
      [  2, 2, 3, 3, 3, 3, 1, 3, 2, 3, 4, 4, 4, 0], // Ž14 Matěj
    ];

    // Matice sympatií (14x14): 1 = velmi sympatický, 5 = nesympatický
    const sympathyMatrix = [
      //  1  2  3  4  5  6  7  8  9 10 11 12 13 14
      [  0, 2, 1, 1, 2, 3, 4, 2, 3, 1, 3, 3, 3, 4], // Ž01 Klára
      [  2, 0, 2, 3, 1, 1, 4, 2, 3, 2, 3, 3, 3, 4], // Ž02 Jakub
      [  1, 2, 0, 1, 3, 3, 5, 2, 4, 2, 3, 3, 3, 4], // Ž03 Tereza
      [  1, 3, 1, 0, 3, 3, 4, 2, 4, 2, 3, 3, 4, 5], // Ž04 Adéla
      [  2, 1, 3, 3, 0, 1, 4, 3, 3, 2, 3, 3, 3, 4], // Ž05 Lukáš
      [  3, 1, 3, 3, 1, 0, 4, 2, 3, 2, 3, 2, 3, 4], // Ž06 Ondřej
      [  4, 4, 4, 4, 3, 3, 0, 3, 2, 3, 4, 4, 4, 5], // Ž07 Dominik
      [  2, 2, 2, 2, 3, 2, 5, 0, 4, 1, 3, 3, 2, 3], // Ž08 Eliška
      [  3, 3, 4, 4, 3, 3, 2, 3, 0, 3, 4, 4, 4, 5], // Ž09 Filip
      [  1, 2, 2, 2, 2, 2, 4, 1, 3, 0, 3, 3, 2, 3], // Ž10 Natálie
      [  2, 2, 3, 3, 3, 3, 5, 2, 4, 2, 0, 1, 3, 3], // Ž11 Štěpán
      [  3, 2, 3, 3, 3, 2, 5, 2, 4, 2, 1, 0, 3, 3], // Ž12 David
      [  2, 3, 3, 3, 3, 3, 5, 2, 4, 2, 3, 3, 0, 3], // Ž13 Veronika
      [  2, 2, 3, 3, 3, 3, 5, 2, 5, 2, 3, 3, 3, 0], // Ž14 Matěj
    ];

    const sampleComments = {
      's_1:s_3': 'Nejlepší kamarádka, vždycky pomůže.',
      's_1:s_7': 'Často shazuje ostatní a provokuje.',
      's_2:s_5': 'Super parťák na sport i do školy.',
      's_2:s_7': 'Dělá dusno ve třídě, pořád se s někým hádá.',
      's_3:s_1': 'Umí třídu stmelit, je fér.',
      's_3:s_7': 'Posmívá se slabším klukům.',
      's_4:s_14': 'S nikým se moc nebaví, je stranou.',
      's_7:s_1': 'Moc všechno řídí a poučuje.',
      's_7:s_14': 'Je divnej, vůbec nezapadá.',
      's_8:s_10': 'Hodná, naslouchá ostatním.',
      's_8:s_7': 'Mám z něj respekt, občas je agresivní.',
      's_10:s_1': 'Spolehlivá a přátelská.',
      's_10:s_8': 'Klidná, je s ní pohoda.',
      's_11:s_12': 'Rozumíme si, sedíme spolu.',
      's_11:s_7': 'Ubližuje Matějovi a dělá z něj legraci.',
      's_12:s_11': 'Dobrý kamarád.',
      's_14:s_7': 'Pořád do mě strká a nadává mi.',
      's_14:s_9': 'Přidává se k Dominikovi.',
      's_14:s_8': 'Jedna z mála, co se mi neposmívá.',
    };

    const ratings = {};
    for (let i = 0; i < students.length; i++) {
      const rater = students[i];
      ratings[rater.id] = {};
      for (let j = 0; j < students.length; j++) {
        if (i === j) continue;
        const target = students[j];
        const key = `${rater.id}:${target.id}`;
        ratings[rater.id][target.id] = {
          influence: influenceMatrix[i][j],
          sympathy: sympathyMatrix[i][j],
          comment: sampleComments[key] || '',
        };
      }
    }

    return {
      version: 1,
      meta: {
        className: '8.B (ukázková třída)',
        school: 'ZŠ Ukázková',
        date: new Date().toISOString().slice(0, 10),
        psychologistNote:
          'Ukázková syntetická data pro prezentaci funkcí aplikace. Neobsahují žádné skutečné osoby.',
        conclusion:
          'Třída má dvě stabilní přátelská jádra (kolem Ž01 a Ž02) s dobrými propojujícími vazbami (Ž10). Zvýšenou pozornost vyžaduje dynamika mezi dominantním neoblíbeným žákem Ž07 (s podporou Ž09) a izolovaným žákem Ž14, kde se objevují slovní signály možného šikanózního chování.',
      },
      scaleLabels: {
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
      },
      students,
      ratings,
    };
  }

  return { createSampleProject };
});
