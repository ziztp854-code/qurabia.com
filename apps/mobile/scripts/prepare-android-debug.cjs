const fs = require('node:fs');
const path = require('node:path');

function once(source, pattern, replacement, label) {
  const matches = source.match(new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g'));
  if (!matches || matches.length !== 1) throw new Error('Unsupported Expo template: ' + label);
  return source.replace(pattern, replacement);
}
function bundledGradle(source) {
  if (!/bundleCommand\s*=\s*["']export:embed["']/.test(source)) throw new Error('Expected Expo export:embed bundler');
  if (/^\s*debuggableVariants\s*=/m.test(source)) throw new Error('debuggableVariants is already configured');
  return once(source, /^react\s*\{/m, 'react {\n    // Standalone QA APK: include JS and assets in the debug variant.\n    debuggableVariants = []', 'react block');
}
function offlineHost(source) {
  if (!source.includes('ExpoReactHostFactory.getDefaultReactHost(')) throw new Error('Expected ExpoReactHostFactory');
  if (/\buseDevSupport\s*=/.test(source)) throw new Error('useDevSupport is already configured');
  return once(source, /context = applicationContext,/, 'context = applicationContext,\n      useDevSupport = false,', 'React host context');
}
function findApplications(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filename = path.join(directory, entry.name);
    return entry.isDirectory() ? findApplications(filename) : entry.name === 'MainApplication.kt' ? [filename] : [];
  });
}
function main() {
  const android = path.resolve(__dirname, '..', 'android');
  const gradle = path.join(android, 'app', 'build.gradle');
  const applications = findApplications(path.join(android, 'app', 'src', 'main', 'java'));
  if (applications.length !== 1) throw new Error('Expected exactly one generated MainApplication.kt');
  // Validate both templates before writing either file. Never change checked-in app sources.
  const nextGradle = bundledGradle(fs.readFileSync(gradle, 'utf8'));
  const nextHost = offlineHost(fs.readFileSync(applications[0], 'utf8'));
  fs.writeFileSync(gradle, nextGradle);
  fs.writeFileSync(applications[0], nextHost);
  console.log('Prepared generated Android debug variant with embedded JS and Metro disabled.');
}
module.exports = { bundledGradle, offlineHost };
if (require.main === module) main();
