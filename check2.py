with open('app.ts', 'r', encoding='utf-8') as f:
    lines = f.readlines()

results = []
for i, line in enumerate(lines):
    if '// ================================================================' in line:
        results.append(f'Line {i+1}: {repr(line)}')

with open('results.txt', 'w') as f:
    f.write('\n'.join(results))