const fs = require('fs');

const filePath = 'C:\\Users\\bharg_4mtuttl\\Desktop\\Google apps\\Maps\\index.html';
const content = fs.readFileSync(filePath, 'utf8');

// Find the exact location to insert - after the volume slider div closes and before the next section div
// The pattern is: </div></div><div class="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/50 rounded-2xl p-4 shadow-sm space-y-4"><label class="flex items-center justify-between"><div class="flex items-center gap-3"><div class="w-8 h-8 rounded-xl bg-sky-500/10 text-sky-500 flex items-center justify-center text-sm">🔄</div><span class="text-sm font-semibold text-slate-700 dark:text-slate-300">Sync history</span>

const searchString = '</div></div><div class="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/50 rounded-2xl p-4 shadow-sm space-y-4"><label class="flex items-center justify-between"><div class="flex items-center gap-3"><div class="w-8 h-8 rounded-xl bg-sky-500/10 text-sky-500 flex items-center justify-center text-sm">🔄</div><span class="text-sm font-semibold text-slate-700 dark:text-slate-300">Sync history</span>';

const pos = content.indexOf(searchString);
console.log('Position:', pos);

if (pos > 0) {
    const newContent = content.substring(0, pos) + 
        '</div></div><label class="flex items-center justify-between"><div class="flex items-center gap-3"><div class="w-8 h-8 rounded-xl bg-cyan-500/10 text-cyan-500 flex items-center justify-center text-sm">📅</div><span class="text-sm font-semibold text-slate-700 dark:text-slate-300">24h timeline</span></div><label class="relative inline-flex items-center cursor-pointer"><input type="checkbox" id="settingsTimeline24hToggle" class="sr-only peer"><div class="w-11 h-6 bg-slate-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/30 dark:peer-focus:ring-primary/30 rounded-full peer dark:bg-slate-600 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-\'\\'\' after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-primary"></div></label></label></div><div class="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/50 rounded-2xl p-4 shadow-sm space-y-4"><label class="flex items-center justify-between"><div class="flex items-center gap-3"><div class="w-8 h-8 rounded-xl bg-sky-500/10 text-sky-500 flex items-center justify-center text-sm">🔄</div><span class="text-sm font-semibold text-slate-700 dark:text-slate-300">Sync history</span>' +
        content.substring(pos + searchString.length);
    
    fs.writeFileSync(filePath, newContent, 'utf8');
    console.log('File updated successfully!');
} else {
    console.log('Search string not found!');
}