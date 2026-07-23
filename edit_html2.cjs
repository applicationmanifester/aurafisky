const fs = require('fs');

const filePath = 'C:/Users/bharg_4mtuttl/Desktop/Google apps/Maps/index.html';
const content = fs.readFileSync(filePath, 'utf8');

// Found at position 73612 - need to find the exact start of the Sync history label
const altSearch = 'Sync history</span></div><label class="relative inline-flex items-center cursor-pointer"><input type="checkbox" id="settingsSyncHistoryToggle"';
const altPos = content.indexOf(altSearch);
console.log('Alt search position:', altPos);

// The Sync history label starts before this - find the beginning of that label
const labelStart = content.lastIndexOf('<label class="flex items-center justify-between">', altPos);
console.log('Label start:', labelStart);

if (labelStart > 0) {
    // Find the end of the previous label (the volume slider section end)
    const prevLabelEnd = content.lastIndexOf('</div></div>', labelStart);
    console.log('Prev label end:', prevLabelEnd);
    
    // The volume slider section ends with </div></div> before the Sync history label
    const insertPos = prevLabelEnd + 11; // after </div></div>
    console.log('Insert position:', insertPos);
    
    // Show context around insert position
    console.log('Context before:', content.substring(insertPos - 50, insertPos));
    console.log('Context after:', content.substring(insertPos, insertPos + 100));
    
    const newToggle = '</div></div><label class="flex items-center justify-between"><div class="flex items-center gap-3"><div class="w-8 h-8 rounded-xl bg-cyan-500/10 text-cyan-500 flex items-center justify-center text-sm">📅</div><span class="text-sm font-semibold text-slate-700 dark:text-slate-300">24h timeline</span></div><label class="relative inline-flex items-center cursor-pointer"><input type="checkbox" id="settingsTimeline24hToggle" class="sr-only peer"><div class="w-11 h-6 bg-slate-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/30 dark:peer-focus:ring-primary/30 rounded-full peer dark:bg-slate-600 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-\'\' after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-primary"></div></label></label></div>';
    
    const newContent = content.substring(0, insertPos) + newToggle + content.substring(insertPos);
    
    fs.writeFileSync(filePath, newContent, 'utf8');
    console.log('File updated successfully!');
} else {
    console.log('Could not find label start');
}