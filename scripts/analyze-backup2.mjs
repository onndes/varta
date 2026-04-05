import { readFileSync } from 'fs';
const data = JSON.parse(
  readFileSync('/Users/vladyslav/Downloads/VARTA_BACKUP_Основна_база_2026-04-04 (1).json', 'utf8')
);

console.log('=== BACKUP #2 (12:26 - after karma reset) ===');
console.log('Users:');
for (const u of data.users) {
  console.log(
    `  id=${u.id} name=${u.name} debt=${u.debt} isActive=${u.isActive} excludeFromAuto=${u.excludeFromAuto} blockedDays=${JSON.stringify(u.blockedDays)}`
  );
}

console.log('\nWeek 16 schedule (2026-04-13 to 2026-04-19):');
const byId = new Map(data.users.map((u) => [u.id, u]));
for (const d of [
  '2026-04-13',
  '2026-04-14',
  '2026-04-15',
  '2026-04-16',
  '2026-04-17',
  '2026-04-18',
  '2026-04-19',
]) {
  const e = data.schedule.find((s) => s.date === d);
  if (!e) {
    console.log(`  ${d}: NO ENTRY`);
    continue;
  }
  const ids = Array.isArray(e.userId) ? e.userId : e.userId == null ? [] : [e.userId];
  const names = ids.map((id) => (byId.get(id) || {}).name || '?');
  console.log(`  ${d}: type=${e.type} users=${JSON.stringify(names)} ids=${JSON.stringify(ids)}`);
}

console.log('\nWeek 15 schedule (2026-04-06 to 2026-04-12):');
for (const d of [
  '2026-04-06',
  '2026-04-07',
  '2026-04-08',
  '2026-04-09',
  '2026-04-10',
  '2026-04-11',
  '2026-04-12',
]) {
  const e = data.schedule.find((s) => s.date === d);
  if (!e) {
    console.log(`  ${d}: NO ENTRY`);
    continue;
  }
  const ids = Array.isArray(e.userId) ? e.userId : e.userId == null ? [] : [e.userId];
  const names = ids.map((id) => (byId.get(id) || {}).name || '?');
  console.log(`  ${d}: type=${e.type} users=${JSON.stringify(names)} ids=${JSON.stringify(ids)}`);
}

// Count per-user in week 16
console.log('\nPer user week 16 count:');
const week16 = {};
for (const d of [
  '2026-04-13',
  '2026-04-14',
  '2026-04-15',
  '2026-04-16',
  '2026-04-17',
  '2026-04-18',
  '2026-04-19',
]) {
  const e = data.schedule.find((s) => s.date === d);
  if (!e || !e.userId) continue;
  const ids = Array.isArray(e.userId) ? e.userId : [e.userId];
  for (const id of ids) {
    week16[id] = (week16[id] || 0) + 1;
  }
}
for (const [id, cnt] of Object.entries(week16)) {
  const u = byId.get(Number(id));
  console.log(`  ${u?.name || id}: ${cnt}`);
}

// Audit log last entries
console.log('\nLast 30 audit log entries:');
const sorted = data.auditLog.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
for (const l of sorted.slice(-30)) {
  console.log(`  [${l.id}] ${l.timestamp} ${l.action}: ${l.details}`);
}
