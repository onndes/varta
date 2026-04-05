#!/usr/bin/env python3
import json, sys
from collections import Counter

path = sys.argv[1] if len(sys.argv) > 1 else '/Users/vladyslav/Downloads/VARTA_BACKUP_Основна_база_2026-04-04 (3).json'
with open(path) as f:
    data = json.load(f)

users = {u['id']: u['name'].split()[0] for u in data['users']}
print('Users:', users)

schedule = {s['date']: s for s in data['schedule'] if 'date' in s}

for wname, start, end in [('Week 16 (Apr 13-19)', 13, 19), ('Week 17 (Apr 20-26)', 20, 26)]:
    print(f'\n=== {wname} ===')
    counts = Counter()
    for d in range(start, end+1):
        ds = f'2026-04-{d:02d}'
        e = schedule.get(ds, {})
        uid = e.get('userId')
        t = e.get('type', '?')
        if isinstance(uid, int):
            uname = users.get(uid, '?')
            counts[uname] += 1
        elif isinstance(uid, list):
            uname = '+'.join(users.get(u, '?') for u in uid)
            for u in uid:
                counts[users.get(u, u)] += 1
        else:
            uname = '-'
        print(f'  {ds}: {uname} ({t})')
    print(f'  Counts: {dict(sorted(counts.items()))}')

print('\nautoScheduleOptions:', json.dumps(data.get('autoScheduleOptions', {}), indent=2, ensure_ascii=False))
