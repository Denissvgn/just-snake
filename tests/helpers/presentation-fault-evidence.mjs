export const DECLARED_OXANIUM_FAULT_BYTES = 'ND07 declared decode failure';

// Self-contained for page.evaluate; retain the browser's actual serialization.
export function observeDeclaredFontFaces() {
  const faces = [...document.fonts].map(font => ({ family: font.family, status: font.status }));
  return { faces, declared: faces.filter(font => font.family === 'Oxanium' || font.family === '"Oxanium"'),
    usable: document.fonts.check('500 16px Oxanium') };
}

export async function observeDeclaredFontLoadFailure() {
  const faces = [...document.fonts].filter(font => font.family === 'Oxanium' || font.family === '"Oxanium"');
  return Promise.all(faces.map(async font => {
    try { await font.load(); return { family: font.family, status: font.status, rejected: false }; }
    catch (error) { return { family: font.family, status: font.status, rejected: true,
      error: { name: error.name, message: error.message } }; }
  }));
}

export function validateDeclaredFontResponse(response, { kind, documentURL, fontURL }) {
  const document = new URL(documentURL), font = new URL(fontURL);
  if (kind !== 'oxanium-decode' || font.href !== new URL('./assets/neon/oxanium-ui.woff2', document).href ||
      font.origin !== document.origin || font.search || !['http:', 'https:'].includes(font.protocol) ||
      response?.url !== fontURL || response.status !== 200 || response.type !== 'font/woff2' ||
      response.body !== DECLARED_OXANIUM_FAULT_BYTES) throw Error('Undeclared controlled local font response');
  return true;
}

export function validateDeclaredFirefoxFontErrors(errors, declaration) {
  validateDeclaredFontResponse(declaration.response, declaration);
  const expected = `[JavaScript Error: "downloadable font: rejected by sanitizer (font-family: "Oxanium" style:normal weight:500..700 width:100 src index:0) source: ${declaration.fontURL}"]`;
  if (declaration.engine !== 'firefox' || !Array.isArray(errors) || errors.length !== 1 ||
      errors[0]?.text !== expected || errors[0].location?.url !== '' ||
      errors[0].location.lineNumber !== 0 || errors[0].location.columnNumber !== 1) {
    throw Error('Undeclared Firefox optional-font error');
  }
  return { acceptedErrors: 1, engine: declaration.engine, fontURL: declaration.fontURL, diagnostic: errors[0] };
}

export function validateDeclaredFontWarnings(warnings, { documentURL, fontURL, sfntVersion }) {
  const document = new URL(documentURL), font = new URL(fontURL);
  if (font.origin !== document.origin || !font.pathname.endsWith('/assets/neon/oxanium-ui.woff2') || font.search ||
      !Number.isSafeInteger(sfntVersion) || !Array.isArray(warnings)) throw Error('Invalid declared local font fault');
  const primary = warning => warning.text === `Failed to decode downloaded font: ${fontURL}` ||
    warning.text.startsWith('downloadable font:') && warning.text.includes(fontURL);
  const hasPrimary = warnings.some(primary);
  if (warnings.length > 2) throw Error('Unbounded declared font diagnostics');
  for (const warning of warnings) {
    if (![documentURL, fontURL].includes(warning.location?.url)) throw Error('Font warning has unrelated location');
    if (primary(warning)) continue;
    if (hasPrimary && warning.text === `OTS parsing error: invalid sfntVersion: ${sfntVersion}`) continue;
    throw Error('Undeclared optional-asset warning');
  }
  return { acceptedWarnings: warnings.length, fontURL, documentURL };
}
