// Playwright interprets file arguments as regexes against full file paths.
export function playwrightSpecPattern(spec) {
  if (typeof spec !== 'string' || !spec.endsWith('.spec.mjs') ||
      spec.includes('/') || spec.includes(String.fromCharCode(92))) throw Error('Invalid partition spec');
  const slash = String.fromCharCode(92), metacharacters = '^$.*+?()[]{}|' + slash;
  const escaped = Array.from(spec, character => metacharacters.includes(character) ? slash + character : character).join('');
  return '(?:^|/)tests/release/' + escaped + '$';
}

export function assertPlaywrightPartition(report, spec, rootDirectory) {
  playwrightSpecPattern(spec);
  if (report?.config?.rootDir !== rootDirectory) throw Error('Unexpected Playwright partition root');
  let count = 0;
  const visit = suite => {
    for (const observed of suite.specs || []) {
      if (observed.file !== spec) throw Error('Unexpected file in Playwright partition: ' + observed.file);
      count++;
    }
    for (const nested of suite.suites || []) visit(nested);
  };
  visit(report);
  if (!count) throw Error('Empty Playwright partition');
  return { spec, discoveredSpecs: count };
}
