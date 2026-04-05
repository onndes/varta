import { readFileSync } from 'fs';
const data = JSON.parse(
  readFileSync('/Users/vladyslav/Downloads/VARTA_BACKUP_Основна_база_2026-04-04 (1).json', 'utf8')
);

console.log('=== User status periods ===');
for (const u of data.users) {
  if (u.statusPeriods && u.statusPeriods.length > 0) {
    console.log(`  ${u.name} (id=${u.id}):`, JSON.stringify(u.statusPeriods));
  }
  if (u.statusFrom || u.statusTo) {
    console.log(
      `  ${u.name} (id=${u.id}): statusFrom=${u.statusFrom} statusTo=${u.statusTo} status=${u.status}`
    );
  }
}

// Check which users are available on each day of week 16
const schedule = {};
for (const s of data.schedule) {
  schedule[s.date] = s;
}

console.log('\n=== Week 15 per-user duty count (2026-04-06..2026-04-12) ===');
const w15 = {};
for (const s of data.schedule) {
  if (s.date >= '2026-04-06' && s.date <= '2026-04-12' && s.userId) {
    const ids = Array.isArray(s.userId) ? s.userId : [s.userId];
    for (const id of ids) w15[id] = (w15[id] || 0) + 1;
  }
}
const byId = new Map(data.users.map((u) => [u.id, u]));
for (const u of data.users) {
  console.log(`  ${u.name}: ${w15[u.id] || 0} duties (excl=${u.excludeFromAuto})`);
}

console.log('\n=== Strat user detail ===');
const strat = data.users.find((u) => u.id === 2);
console.log(JSON.stringify(strat, null, 2));

console.log('\n=== Avdievska user detail ===');
const avd = data.users.find((u) => u.id === 4);
console.log(JSON.stringify(avd, null, 2));
