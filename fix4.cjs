const fs = require('fs');
const file = 'C:\\Users\\bharg_4mtuttl\\Desktop\\Google apps\\Maps\\app.js';
let content = fs.readFileSync(file, 'utf8');

// Find the remaining floating code (lines 431-487 in the current file)
const badStart = content.indexOf('\n    // Register Service Worker for PWA\n    this.registerServiceWorker();\n');
const badEnd = content.indexOf('\n\n  // Dynamically load feature modules on demand\n  async _initFeaturesLazy() {');

if (badStart === -1 || badEnd === -1) {
  console.log('Could not find bad code');
  process.exit(1);
}

console.log('Found bad code at:', badStart, 'to', badEnd);

// Remove the bad code (including the extra closing brace before it)
const beforeBad = content.substring(0, badStart);
const afterBad = content.substring(badEnd);

// Check if there's an extra closing brace before the bad code
let cleanBefore = beforeBad;
// Look for the extra closing brace that's causing issues
const extraBraceIdx = beforeBad.lastIndexOf('\n  }\n\n    // Register Service Worker');
if (extraBraceIdx !== -1) {
  cleanBefore = beforeBad.substring(0, extraBraceIdx + 1); // Keep up to the closing brace of init()
  console.log('Removed extra closing brace');
}

content = cleanBefore + '\n\n  // Dynamically load feature modules on demand' + afterBad;

fs.writeFileSync(file, content, 'utf8');
console.log('Fixed!');