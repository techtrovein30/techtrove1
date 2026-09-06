import sys

with open('src/pages/RegisterPage.tsx', 'r') as f:
    code = f.read()

# Fix 113 & 143: preselectedId vs preselectedIds
code = code.replace('function RegistrationFlow({ preselectedIds }: { preselectedIds: string | null }) {', 'function RegistrationFlow({ preselectedId }: { preselectedId: string | null }) {')

# Wait, the error is: Property 'preselectedId' does not exist on type 'IntrinsicAttributes & { preselectedIds: string | null; }'
# Let's just blindly fix it back to preselectedId
code = code.replace('{ preselectedIds }: { preselectedIds: string | null }', '{ preselectedId }: { preselectedId: string | null }')

# Fix 507: selectedId does not exist
# In SportStep definition
code = code.replace('  selectedId,\n  selectedDayId,\n  onSelectDay,\n  onSelect,\n  events,\n  loading,\n  isInternal,\n}: {\n  days: Day[];\n  selectedIds: string[];\n', '  selectedIds,\n  selectedDayId,\n  onSelectDay,\n  onSelect,\n  events,\n  loading,\n  isInternal,\n}: {\n  days: Day[];\n  selectedIds: string[];\n')
# Just to be safe, replace selectedId with selectedIds in SportStep arguments
code = code.replace('function SportStep({\n  days,\n  selectedId,', 'function SportStep({\n  days,\n  selectedIds,')
code = code.replace('function SportStep({\n  days,\n  selectedId,\n  selectedDayId,', 'function SportStep({\n  days,\n  selectedIds,\n  selectedDayId,')

# Fix 531, 595: Cannot find name selectedIds, did you mean selectedId?
# This means the signature actually still has selectedId instead of selectedIds!
# Let's use regex to replace the whole SportStep signature
import re
pattern = re.compile(r'function SportStep\(\{.*?\}\) \{', re.DOTALL)
new_sig = '''function SportStep({
  days,
  selectedIds,
  selectedDayId,
  onSelectDay,
  onSelect,
  events,
  loading,
  isInternal,
}: {
  days: Day[];
  selectedIds: string[];
  selectedDayId: string | null;
  onSelectDay: (id: string) => void;
  onSelect: (ev: TechEvent) => void;
  events: TechEvent[];
  loading: boolean;
  isInternal: boolean;
}) {'''
code = pattern.sub(new_sig, code, count=1)

with open('src/pages/RegisterPage.tsx', 'w') as f:
    f.write(code)

with open('src/lib/api.ts', 'r') as f:
    api_code = f.read()

# Fix api.ts unused import
api_code = api_code.replace('isSportEvent,\n  isIndividualEvent,', 'isIndividualEvent,')
api_code = api_code.replace('isSportEvent, isIndividualEvent,', 'isIndividualEvent,')

with open('src/lib/api.ts', 'w') as f:
    f.write(api_code)
