const fs = require('fs');
let c = fs.readFileSync('app.js', 'utf8');

// Find the problematic section
const idx = c.indexOf('this._initFeaturesLazy();');
if (idx === -1) {
  console.log('NOT FOUND');
  process.exit(1);
}

console.log('Found at:', idx);
console.log('Context (300 chars):', c.substring(idx, idx+300));
console.log('---');
console.log('Context (600 chars):', c.substring(idx, idx+600));