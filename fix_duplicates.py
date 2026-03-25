#!/usr/bin/env python3
"""
Fix duplicate code in files that VS Code keeps reverting.
Run this script once after closing the affected files in VS Code.
"""
import re

# Fix src/lib/api.ts - remove duplicate content after first };
print("Fixing src/lib/api.ts...")
with open('src/lib/api.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# Find the first }; that closes the api object (after getUnifiedRiskScore)
lines = content.split('\n')
end_idx = None
for i, line in enumerate(lines):
    if line.strip() == '};' and i > 100:
        end_idx = i
        break

if end_idx:
    clean = '\n'.join(lines[:end_idx+1]) + '\n'
    with open('src/lib/api.ts', 'w', encoding='utf-8') as f:
        f.write(clean)
    print(f"  Fixed: {len(clean.split(chr(10)))} lines (was {len(lines)})")
else:
    print("  No fix needed or could not find end")

# Fix src/pages/DevPulseSecurityDashboard.tsx - remove duplicate content
print("Fixing src/pages/DevPulseSecurityDashboard.tsx...")
with open('src/pages/DevPulseSecurityDashboard.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Find the second 'export default function' and cut everything from there
marker = 'export default function DevPulseSecurityDashboard'
idx1 = content.find(marker)
idx2 = content.find(marker, idx1 + 1)
if idx2 != -1:
    # Find the closing } of the first export default function
    # It ends at the first }; after the ProtectedRoute
    end_of_first = content.find('\n}', content.find('</ProtectedRoute>', idx1))
    if end_of_first != -1:
        clean = content[:end_of_first+2] + '\n'
        with open('src/pages/DevPulseSecurityDashboard.tsx', 'w', encoding='utf-8') as f:
            f.write(clean)
        print(f"  Fixed: {len(clean.split(chr(10)))} lines (was {len(content.split(chr(10)))})")
    else:
        print("  Could not find end of first export")
else:
    print("  No duplicate found")

# Fix src/App.tsx - remove duplicate content after first export default App;
print("Fixing src/App.tsx...")
with open('src/App.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

marker = 'export default App;'
idx = content.find(marker)
if idx != -1:
    clean = content[:idx + len(marker)] + '\n'
    if len(clean) < len(content):
        with open('src/App.tsx', 'w', encoding='utf-8') as f:
            f.write(clean)
        print(f"  Fixed: {len(clean.split(chr(10)))} lines (was {len(content.split(chr(10)))})")
    else:
        print("  No fix needed")
else:
    print("  Could not find marker")

print("\nDone! All files fixed.")
print("Note: If VS Code reverts these changes, close the files in VS Code first, then run this script again.")
"""
Fix duplicate code in files that VS Code keeps reverting.
Run this script once after closing the affected files in VS Code.
"""
import re

# Fix src/lib/api.ts - remove duplicate content after first };
print("Fixing src/lib/api.ts...")
with open('src/lib/api.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# Find the first }; that closes the api object (after getUnifiedRiskScore)
lines = content.split('\n')
end_idx = None
for i, line in enumerate(lines):
    if line.strip() == '};' and i > 100:
        end_idx = i
        break

if end_idx:
    clean = '\n'.join(lines[:end_idx+1]) + '\n'
    with open('src/lib/api.ts', 'w', encoding='utf-8') as f:
        f.write(clean)
    print(f"  Fixed: {len(clean.split(chr(10)))} lines (was {len(lines)})")
else:
    print("  No fix needed or could not find end")

# Fix src/pages/DevPulseSecurityDashboard.tsx - remove duplicate content
print("Fixing src/pages/DevPulseSecurityDashboard.tsx...")
with open('src/pages/DevPulseSecurityDashboard.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Find the second 'export default function' and cut everything from there
marker = 'export default function DevPulseSecurityDashboard'
idx1 = content.find(marker)
idx2 = content.find(marker, idx1 + 1)
if idx2 != -1:
    # Find the closing } of the first export default function
    # It ends at the first }; after the ProtectedRoute
    end_of_first = content.find('\n}', content.find('</ProtectedRoute>', idx1))
    if end_of_first != -1:
        clean = content[:end_of_first+2] + '\n'
        with open('src/pages/DevPulseSecurityDashboard.tsx', 'w', encoding='utf-8') as f:
            f.write(clean)
        print(f"  Fixed: {len(clean.split(chr(10)))} lines (was {len(content.split(chr(10)))})")
    else:
        print("  Could not find end of first export")
else:
    print("  No duplicate found")

# Fix src/App.tsx - remove duplicate content after first export default App;
print("Fixing src/App.tsx...")
with open('src/App.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

marker = 'export default App;'
idx = content.find(marker)
if idx != -1:
    clean = content[:idx + len(marker)] + '\n'
    if len(clean) < len(content):
        with open('src/App.tsx', 'w', encoding='utf-8') as f:
            f.write(clean)
        print(f"  Fixed: {len(clean.split(chr(10)))} lines (was {len(content.split(chr(10)))})")
    else:
        print("  No fix needed")
else:
    print("  Could not find marker")

print("\nDone! All files fixed.")
print("Note: If VS Code reverts these changes, close the files in VS Code first, then run this script again.")

