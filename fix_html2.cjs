const fs = require('fs');

const filePath = 'C:/Users/bharg_4mtuttl/Desktop/Google apps/Maps/index.html';
let content = fs.readFileSync(filePath, 'utf8');

console.log('File length:', content.length);

// Find and fix the specific issues
// Issue 1: after:content-'' should be after:content-['']
content = content.replace(/after:content-''/g, "after:content-['']");

// Issue 2: Find the malformed closing tags around the 24h timeline section
// The pattern seems to be: </div></div></div><label... should be </div></div></div><label...
// But we have: </div></div></div><label (missing the closing of the previous div properly)

// Let's find the exact position mentioned in error: line 868 around char 6640
// Actually the error is at position 6640 in the minified line

// Search for the malformed part after 24h timeline toggle
const searchStr = "settingsTimeline24hToggle";
const pos = content.indexOf(searchStr);
if (pos > 0) {
    // Look at 500 chars after to find the issue
    const after = content.substring(pos, pos + 800);
    console.log('After toggle:', after.substring(0, 500));
    
    // The issue is likely: </label</div><div class="bg-white...
    // Should be: </label></div><div class="bg-white...
    if (after.includes('</label</div>')) {
        content = content.replace('</label</div>', '</label></div>');
        console.log('Fixed </label</div> -> </label></div>');
    }
}

// Also check for: </div></div></div><label (should have closing divs properly)
// And the ><div issue

// Write back
fs.writeFileSync(filePath, content, 'utf8');
console.log('Done');