import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateDeclaredFontWarnings, validateDeclaredFontResponse, validateDeclaredFirefoxFontErrors,
  observeDeclaredFontFaces, observeDeclaredFontLoadFailure, DECLARED_OXANIUM_FAULT_BYTES } from '../helpers/presentation-fault-evidence.mjs';
const declaration = { documentURL: 'http://fixture.invalid/just-snake/index.html?rules=2',
  fontURL: 'http://fixture.invalid/just-snake/assets/neon/oxanium-ui.woff2', sfntVersion: 1313091639 };
const warning = text => ({ text, location: { url: declaration.documentURL } });
const primary = warning(`Failed to decode downloaded font: ${declaration.fontURL}`);
const ots = warning('OTS parsing error: invalid sfntVersion: 1313091639');
test('Declared optional-font evidence accepts only exact URL/location decode and bounded companion OTS', () => {
  assert.equal(validateDeclaredFontWarnings([primary, ots], declaration).acceptedWarnings, 2);
  for (const warnings of [[warning('Unrelated warning')], [ots], [primary, warning('OTS parsing error: invalid sfntVersion: 0')],
    [{ ...primary, location: { url: 'https://elsewhere.invalid/' } }], [warning(primary.text.replace('oxanium', 'unknown'))],
    [primary, ots, ots]]) assert.throws(() => validateDeclaredFontWarnings(warnings, declaration));
  assert.throws(() => validateDeclaredFontWarnings([primary], { ...declaration, fontURL: 'https://other.invalid/font.woff2' }));
});

test('Declared FontFace load captures real rejection separately from FontFaceSet fallback check', async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const faces = [{ family: '"Oxanium"', status: 'error', async load() { throw new Error('Declared decode failure'); } },
    { family: 'Other', status: 'error', async load() { throw new Error('Unrelated face must not load'); } }];
  faces.check = () => true;
  Object.defineProperty(globalThis, 'document', { configurable:true, value: { fonts: faces } });
  try {
    const observed = await observeDeclaredFontLoadFailure();
    assert.equal(observeDeclaredFontFaces().usable, true);
    assert.deepEqual(observed, [{ family:'"Oxanium"',status:'error',rejected:true,error:{name:'Error',message:'Declared decode failure'} }]);
    faces[0] = { family:'Oxanium',status:'loaded',async load() { return this; } };
    assert.deepEqual(await observeDeclaredFontLoadFailure(), [{family:'Oxanium',status:'loaded',rejected:false}]);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'document', previous); else delete globalThis.document;
  }
});

const firefoxDeclaration = { ...declaration, kind: 'oxanium-decode', engine: 'firefox', response: {
  url: declaration.fontURL, status: 200, type: 'font/woff2', body: DECLARED_OXANIUM_FAULT_BYTES } };
const rejection = { text: `[JavaScript Error: "downloadable font: rejected by sanitizer (font-family: "Oxanium" style:normal weight:500..700 width:100 src index:0) source: ${declaration.fontURL}"]`,
  location: { url: '', lineNumber: 0, columnNumber: 1 } };

test('Explicit Firefox optional-font rejection requires exact controlled bytes URL family native format location and count', () => {
  assert.equal(validateDeclaredFontResponse(firefoxDeclaration.response, firefoxDeclaration), true);
  assert.equal(validateDeclaredFirefoxFontErrors([rejection], firefoxDeclaration).acceptedErrors, 1);
  for (const errors of [[], [rejection,rejection], [{ ...rejection, text: 'Unrelated console error' }],
    [{ ...rejection, text: rejection.text.replace('Oxanium', 'Other') }],
    [{ ...rejection, text: rejection.text.replace('rejected by sanitizer', 'failed to fetch') }],
    [{ ...rejection, text: rejection.text.replace('oxanium-ui.woff2', 'other.woff2') }],
    [{ ...rejection, text: rejection.text.replace('fixture.invalid', 'external.invalid') }],
    [{ ...rejection, location: { ...rejection.location, url: declaration.documentURL } }],
    [{ ...rejection, location: { ...rejection.location, columnNumber: 0 } }],
    [rejection, { ...rejection, text: 'Unrelated console error' }]]) {
    assert.throws(() => validateDeclaredFirefoxFontErrors(errors, firefoxDeclaration));
  }
  for (const invalid of [{ kind: null }, { kind: 'undeclared' }, { engine: 'chromium' }, { engine: 'webkit' },
    { fontURL: declaration.fontURL + '?retry=1' }, { fontURL: 'https://external.invalid/assets/neon/oxanium-ui.woff2' },
    { fontURL: declaration.fontURL.replace('/just-snake/', '/') }]) {
    assert.throws(() => validateDeclaredFirefoxFontErrors([rejection], { ...firefoxDeclaration, ...invalid }));
  }
  for (const invalid of [{ body: 'Other invalid bytes' }, { status: 404 }, { type: 'text/plain' },
    { url: declaration.fontURL.replace('oxanium', 'other') }]) {
    assert.throws(() => validateDeclaredFirefoxFontErrors([rejection], { ...firefoxDeclaration,
      response: { ...firefoxDeclaration.response, ...invalid } }));
  }
});

test('FontFace evidence preserves raw statuses and accepts only actual Oxanium or quoted Oxanium serialization', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const faces = [{ family: 'Oxanium', status: 'loaded' }, { family: '"Oxanium"', status: 'error' },
    ...['Oxanium Extra','oxanium',' Oxanium ','"Oxanium\'','"Oxanium", serif',"'Oxanium'"].map(family => ({ family, status:'loaded' }))];
  faces.check = value => value === '500 16px Oxanium';
  Object.defineProperty(globalThis, 'document', { configurable:true, value: { fonts: faces } });
  try {
    const observed = observeDeclaredFontFaces();
    assert.deepEqual(observed.declared, faces.slice(0,2));
    assert.equal(observed.faces.length, faces.length); assert.equal(observed.usable, true);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'document', previous); else delete globalThis.document;
  }
});
