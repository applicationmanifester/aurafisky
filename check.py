with open('app.ts', 'r', encoding='utf-8') as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if '// ================================================================' in line:
        print(f'Line {i+1}: {repr(line)}')
        for j in range(max(0, i-2), min(len(lines), i+10)):
            print(f'Line {j+1}: {repr(lines[j])}')
        break