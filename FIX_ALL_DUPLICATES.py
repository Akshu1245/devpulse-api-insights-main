#!/usr/bin/env python3
"""
DevPulse Fix Script - Run this after closing affected files in VS Code.
Fixes duplicate export default function issues caused by VS Code file conflicts.

Usage: python FIX_ALL_DUPLICATES.py
"""
import os
import sys

def fix_duplicate_exports(path):
    """Remove duplicate export default function blocks."""
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    marker = 'export default function '
    idx1 = content.find(marker)
    if idx1 == -1:
        return False, 'no export default found'
    
    idx2 = content.find(marker, idx1 + 1)
    if idx2 != -1:
        clean = content[:idx2].rstrip() + '\n'
        with open(path, 'w', encoding='utf-8') as f:
            f.write(clean)
        return True, f'removed duplicate ({len(content)} -> {len(clean)} chars)'
    
    return False, f'no duplicate ({len(content)} chars)'


def fix_api_ts(path):
    """Fix duplicate content in api.ts after the closing };"""
    with open(path, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    # Find the first }; that closes the api object
    first_close = None
    for i, line in enumerate(lines):
        if line.strip() == '};' and i > 50:
            first_close = i
            break
    
    if first_close and len(lines) > first_close + 3:
        clean_lines = lines[:first_close + 1]
        with open(path, 'w', encoding='utf-8') as f:
            f.writelines(clean_lines)
        return True, f'removed {len(lines) - len(clean_lines)} duplicate lines'
    
    return False, f'no duplicate ({len(lines)} lines)'


print("DevPulse Duplicate Fix Script")
print("=" * 50)

# Fix component files with duplicate export default
component_files = [
    'src/components/devpulse/ComplianceReportPanel.tsx',
    'src/components/devpulse/PostmanImporter.tsx',
    'src/components/devpulse/ThinkingTokenPanel.tsx',
    'src/components/devpulse/UnifiedRiskScorePanel.tsx',
    'src/pages/DevPulseSecurityDashboard.tsx',
    'src/App.tsx',
]

for path in component_files:
    if os.path.exists(path):
        fixed, msg = fix_duplicate_exports(path)
        status = "FIXED" if fixed else "OK"
        print(f"{status}: {path} - {msg}")
    else:
        print(f"MISSING: {path}")

# Fix api.ts
api_path = 'src/lib/api.ts'
if os.path.exists(api_path):
    fixed, msg = fix_api_ts(api_path)
    status = "FIXED" if fixed else "OK"
    print(f"{status}: {api_path} - {msg}")

print("\nDone! Now run: npx vite build")
print("\nIf VS Code reverts these changes again:")
print("1. Close the affected files in VS Code (Ctrl+W)")
print("2. Run this script again")
print("3. Then run: npx vite build")
"""
DevPulse Fix Script - Run this after closing affected files in VS Code.
Fixes duplicate export default function issues caused by VS Code file conflicts.

Usage: python FIX_ALL_DUPLICATES.py
"""
import os
import sys

def fix_duplicate_exports(path):
    """Remove duplicate export default function blocks."""
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    marker = 'export default function '
    idx1 = content.find(marker)
    if idx1 == -1:
        return False, 'no export default found'
    
    idx2 = content.find(marker, idx1 + 1)
    if idx2 != -1:
        clean = content[:idx2].rstrip() + '\n'
        with open(path, 'w', encoding='utf-8') as f:
            f.write(clean)
        return True, f'removed duplicate ({len(content)} -> {len(clean)} chars)'
    
    return False, f'no duplicate ({len(content)} chars)'


def fix_api_ts(path):
    """Fix duplicate content in api.ts after the closing };"""
    with open(path, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    # Find the first }; that closes the api object
    first_close = None
    for i, line in enumerate(lines):
        if line.strip() == '};' and i > 50:
            first_close = i
            break
    
    if first_close and len(lines) > first_close + 3:
        clean_lines = lines[:first_close + 1]
        with open(path, 'w', encoding='utf-8') as f:
            f.writelines(clean_lines)
        return True, f'removed {len(lines) - len(clean_lines)} duplicate lines'
    
    return False, f'no duplicate ({len(lines)} lines)'


print("DevPulse Duplicate Fix Script")
print("=" * 50)

# Fix component files with duplicate export default
component_files = [
    'src/components/devpulse/ComplianceReportPanel.tsx',
    'src/components/devpulse/PostmanImporter.tsx',
    'src/components/devpulse/ThinkingTokenPanel.tsx',
    'src/components/devpulse/UnifiedRiskScorePanel.tsx',
    'src/pages/DevPulseSecurityDashboard.tsx',
    'src/App.tsx',
]

for path in component_files:
    if os.path.exists(path):
        fixed, msg = fix_duplicate_exports(path)
        status = "FIXED" if fixed else "OK"
        print(f"{status}: {path} - {msg}")
    else:
        print(f"MISSING: {path}")

# Fix api.ts
api_path = 'src/lib/api.ts'
if os.path.exists(api_path):
    fixed, msg = fix_api_ts(api_path)
    status = "FIXED" if fixed else "OK"
    print(f"{status}: {api_path} - {msg}")

print("\nDone! Now run: npx vite build")
print("\nIf VS Code reverts these changes again:")
print("1. Close the affected files in VS Code (Ctrl+W)")
print("2. Run this script again")
print("3. Then run: npx vite build")

