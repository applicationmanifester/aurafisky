// check-server.mjs — verifies the Vite dev server serves main.ts and resolves its full import graph
const ORIGIN = 'http://localhost:5173';
const seen = new Set();
const failures = [];

async function checkModule(url, depth = 0) {
  if (seen.has(url) || depth > 3) return;
  seen.add(url);
  try {
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text();
      failures.push(`${res.status} ${url} :: ${body.slice(0, 160).replace(/\s+/g, ' ')}`);
      return;
    }
    const text = await res.text();
    if (text.includes('Failed to resolve import') || text.includes('does not provide an export')) {
      failures.push(`transform-error ${url} :: ${text.slice(0, 200).replace(/\s+/g, ' ')}`);
      return;
    }
    const specs = [...text.matchAll(/(?:import|export)[^'"]*?from\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]/g)]
      .map(m => m[1] || m[2])
      .filter(s => s && (s.startsWith('/') || s.startsWith('.')));
    for (const s of specs) {
      await checkModule(new URL(s, url).href, depth + 1);
    }
  } catch (e) {
    failures.push(`fetch-failed ${url} :: ${e.message}`);
  }
}

const root = await fetch(`${ORIGIN}/src/main.ts`);
console.log('main.ts status:', root.status);
if (root.ok) {
  console.log('--- first 500 chars of transformed module ---');
  console.log((await root.text()).slice(0, 500));
}
await checkModule(`${ORIGIN}/src/main.ts`);
console.log(`\nChecked ${seen.size} modules`);
if (failures.length) {
  console.log('FAILURES:');
  failures.slice(0, 20).forEach(f => console.log(' -', f));
  process.exit(1);
} else {
  console.log('ALL MODULES OK — app import graph fully resolvable');
}
