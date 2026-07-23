const fs = require('fs');

const filePath = 'C:/Users/bharg_4mtuttl/Desktop/Google apps/Maps/index.html';
let content = fs.readFileSync(filePath, 'utf8');

// Fix 1: after:content-'' -> after:content-['']
content = content.replace(/after:content-''/g, "after:content-['']");

// Fix 2: </label (missing closing >) -> </label>
// Find the pattern where it's </label</div> or </label<
content = content.replace(/<\/label(<|$)/g, '</label>$1');

// Fix 3: There may be other similar issues - </label (no >) before </div>
// Look for pattern </label</div and fix to </label></div
content = content.replace(/<\/label<\/div>/g, '</label></div>');

fs.writeFileSync(filePath, content, 'utf8');
console.log('Fixed HTML');