with open('app.ts', 'rb') as f:
    content = f.read()

# Find the problematic area
idx = content.rfind(b'// ================================================================')
if idx >= 0:
    print('Found at:', idx)
    print(content[idx:idx+300])
else:
    print('Not found')