const fs = require('fs');

const filePath = 'C:/Users/bharg_4mtuttl/Desktop/Google apps/Maps/index.html';
const content = fs.readFileSync(filePath, 'utf8');

// Fix 1: </div</div></div> -> </div></div></div>
let fixed = content.replace('</div</div></div><label class="flex items-center justify-between"><div class="flex items-center gap-3"><div class="w-8 h-8 rounded-xl bg-cyan-500/10 text-cyan-500 flex items-center justify-center text-sm">📅</div>', '</div></div></div><label class="flex items-center justify-between"><div class="flex items-center gap-3"><div class="w-8 h-8 rounded-xl bg-cyan-500/10 text-cyan-500 flex items-center justify-center text-sm">📅</div>');

// Fix 2: ></div> -> </div> (the stray > before the next div)
fixed = fixed.replace('></div>><div class="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/50 rounded-2xl p-4 shadow-sm space-y-4"><label class="flex items-center justify-between"><div class="flex items-center gap-3"><div class="w-8 h-8 rounded-xl bg-sky-500/10 text-sky-500 flex items-center justify-center text-sm">🔄</div>', '</div><div class="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/50 rounded-2xl p-4 shadow-sm space-y-4"><label class="flex items-center justify-between"><div class="flex items-center gap-3"><div class="w-8 h-8 rounded-xl bg-sky-500/10 text-sky-500 flex items-center justify-center text-sm">🔄</div>');

fs.writeFileSync(filePath, fixed, 'utf8');
console.log('Fixed HTML');