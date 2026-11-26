const test = require('node:test');
const assert = require('node:assert/strict');
const SocioEngine = require('../js/engine.js');
const { createSampleProject } = require('../js/sampleData.js');

test('analyze() correctly computes indices, quadrants, cliques, and risk flags on sample class', () => {
  const project = createSampleProject();
  const result = SocioEngine.analyze(project, {
    thresholdMode: 'fixed',
    mutualSympathyMax: 2,
    mutualAntipathyMin: 4,
  });

  assert.equal(result.studentCount, 14);
  assert.equal(result.completeness.influence, 1);
  assert.equal(result.completeness.sympathy, 1);

  const byId = new Map(result.students.map((s) => [s.student.id, s]));

  // Klára (s_1) a Jakub (s_2) musí být v kvadrantu leader_popular
  assert.equal(byId.get('s_1').quadrant.id, 'leader_popular');
  assert.equal(byId.get('s_2').quadrant.id, 'leader_popular');

  // Dominik (s_7) má mít vysoký vliv (<= 2.0) a nízkou oblibu (>= 4.0) -> leader_unpopular
  const dominik = byId.get('s_7');
  assert.equal(dominik.quadrant.id, 'leader_unpopular');
  assert.ok(dominik.influenceIndex <= 2.1, `Expected high influence, got ${dominik.influenceIndex}`);
  assert.ok(dominik.sympathyIndex >= 4.0, `Expected low sympathy, got ${dominik.sympathyIndex}`);

  // Matěj (s_14) má být v kvadrantu isolated_at_risk a bez vzájemných sympatií
  const matej = byId.get('s_14');
  assert.equal(matej.quadrant.id, 'isolated_at_risk');
  assert.equal(matej.mutualSympathies.length, 0);
  assert.ok(matej.riskFlags.length >= 2);
  assert.ok(result.cliques.isolatedIds.includes('s_14'));

  // Musí najít přátelské kliky (např. Klára-Tereza-Adéla-Natálie a Jakub-Lukáš-Ondřej)
  assert.ok(result.cliques.groups.length >= 2, 'Expected at least 2 cliques of size >= 3');

  // Koheze musí být v intervalu 0..100 %
  assert.ok(result.classMetrics.cohesionIndex > 0 && result.classMetrics.cohesionIndex <= 100);
});

test('CSV export and import round-trip preserves matrix scores', () => {
  const original = createSampleProject();
  const csvInf = SocioEngine.exportMatrixToCSV(original, 'influence');
  const csvSym = SocioEngine.exportMatrixToCSV(original, 'sympathy');

  const imported = SocioEngine.createEmptyProject({ className: 'Import' });
  const countInf = SocioEngine.importMatrixFromCSV(imported, 'influence', csvInf);
  const countSym = SocioEngine.importMatrixFromCSV(imported, 'sympathy', csvSym);

  assert.equal(imported.students.length, 14);
  assert.equal(countInf, 14 * 13);
  assert.equal(countSym, 14 * 13);

  const origAnalysis = SocioEngine.analyze(original);
  const impAnalysis = SocioEngine.analyze(imported);

  assert.equal(origAnalysis.classMetrics.influenceMean, impAnalysis.classMetrics.influenceMean);
  assert.equal(origAnalysis.classMetrics.sympathyMean, impAnalysis.classMetrics.sympathyMean);
  assert.equal(origAnalysis.classMetrics.cohesionIndex, impAnalysis.classMetrics.cohesionIndex);
});

test('analyze() handles empty project gracefully', () => {
  const empty = SocioEngine.createEmptyProject();
  const result = SocioEngine.analyze(empty);
  assert.equal(result.studentCount, 0);
  assert.equal(result.classMetrics.influenceMean, null);
  assert.equal(result.classMetrics.sympathyMean, null);
  assert.equal(result.classMetrics.cohesionIndex, null);
});

test('SocioCrypto encrypts and decrypts project with password and rejects wrong password', async () => {
  const fs = require('node:fs');
  const vm = require('node:vm');
  const code = fs.readFileSync(require.resolve('../js/crypto.js'), 'utf8');
  const sandbox = {
    self: {},
    crypto: globalThis.crypto,
    TextEncoder: globalThis.TextEncoder,
    TextDecoder: globalThis.TextDecoder,
    btoa: globalThis.btoa,
    atob: globalThis.atob,
  };
  vm.runInNewContext(code, sandbox);
  const SocioCrypto = sandbox.self.SocioCrypto;

  const project = createSampleProject();
  const encrypted = await SocioCrypto.encryptProject(project, 'tajne-heslo-123');
  assert.ok(encrypted.includes('tridni-sociometrie-encrypted'));
  assert.ok(!encrypted.includes('Klára Novotná'));

  const decrypted = await SocioCrypto.decryptProject(encrypted, 'tajne-heslo-123');
  assert.equal(decrypted.students.length, 14);
  assert.equal(decrypted.students[0].name, 'Klára Novotná');

  await assert.rejects(() => SocioCrypto.decryptProject(encrypted, 'spatne-heslo'));
});
