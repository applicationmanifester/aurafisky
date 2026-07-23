const fs = require('fs');

const filePath = 'C:\\Users\\bharg_4mtuttl\\Desktop\\Google apps\\Maps\\index.html';
const content = fs.readFileSync(filePath, 'utf8');

console.log('File length:', content.length);

const search = 'settingsVolumeSlider';
const pos = content.indexOf(search);
console.log('Position:', pos);

if (pos > 0) {
    console.log('Context:', content.substring(pos, pos + 600));
} else {
    console.log('Not found');
}