# AGENTS.md — Codebase Guide for AI Agents

> Read this file in full before touching any code in this repository. It exists to prevent
> regressions that have already happened once.

---

## 1. Project Overview

**ВАРТА** is a military duty-schedule management application for Ukrainian units. Tech stack:
**React 19**, **TypeScript**, **Vite**, **Tauri** (desktop shell), **Dexie.js** (IndexedDB ORM),
**Bootstrap 5**.

The auto-scheduler (`src/services/autoScheduler/`) fills a duty roster for a configurable date
range. It must guarantee:

1. **Hard constraints** — users who are inactive, on leave, blocked for the day-of-week, or violate
   a rest-day or incompatible-pair rule are **never** assigned.
2. **Fairness** — across the group, every day-of-week accumulates duties as evenly as possible;
   total load is normalized by each user's days-active so newcomers and users returning from absence
   are not penalized.
3. **No same-DOW back-to-back weeks** — the scheduler strongly avoids assigning the same person to
   the same day-of-week in consecutive weeks.

The algorithm runs in two passes: a greedy left-to-right draft (Pass 1) followed by multi-phase
pair/single swap optimization (Pass 2) that minimizes a weighted global objective `Z`.

---

## 2. File Map — What Lives Where

### `src/services/autoScheduler/`

| File               | Responsibility                                                                                                                                                                                                                                                                                                                                                                                      | Do NOT put here                                                |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `helpers.ts`       | All constants (`FLOAT_EPSILON`, `MIN_USERS_FOR_WEEKLY_LIMIT`, `MS_PER_DAY`, etc.), date utilities (`getWeekWindow`, `getDatesInRange`, `getDateMinusDays`), per-user metrics (`computeUserLoadRate`, `daysSinceLastAssignment`, `daysSinceLastSameDowAssignment`, `countUserAssignmentsInRange`, `countUnavailableDaysInRange`), **`computeGlobalObjective`** (the weighted objective function `Z`) | UI logic, DB calls, filter pipeline, comparator logic          |
| `comparator.ts`    | **`buildUserComparator`** (the deterministic sort function, priorities −2…9), all six pool filters: `filterByRestDays`, `filterByIncompatiblePairs`, `filterBySameWeekdayLastWeek`, `filterByWeeklyCap`, `filterForceUseAllWhenFew`, `filterEvenWeeklyDistribution`                                                                                                                                 | Swap logic, decision-log text, DB calls                        |
| `scheduler.ts`     | **`autoFillSchedule`** only — the two-pass entry point that wires the filter pipeline + comparator (Pass 1) and calls `performSwapOptimization` (Pass 2)                                                                                                                                                                                                                                            | Any helper function, any constant, any filter                  |
| `swapOptimizer.ts` | `isAutoParticipant`, `isHardEligible`, `isLookAheadSafe`, `wouldViolateRestDays`, `wouldViolateIncompatiblePairs`, `wouldCreateSameDowRepeat`, `BASE_SWAP_ITERATIONS`, `getAdaptiveMaxIterations`, **`performSwapOptimization`**                                                                                                                                                                    | Comparator logic, decision-log text, DB calls                  |
| `decisionLog.ts`   | **`buildDecisionLog`**, DOW name maps (`DOW_NAMES`, `DOW_NAMES_NOMINATIVE`, `DOW_SHORT`), `timesWord`, `toIsoDow`, `isDowBlockedForUser`, `REASON_UA`, `translateReason`                                                                                                                                                                                                                            | Scheduling logic, filter pipeline, DB calls                    |
| `index.ts`         | Public API surface: re-exports `autoFillSchedule`, `calculateUserFairnessIndex`, `computeUserLoadRate`; implements `saveAutoSchedule`, `getFreeUsersForDate`, `recalculateScheduleFrom`                                                                                                                                                                                                             | Core algorithm logic — this file wires existing functions only |

### Adjacent files

| File                              | Responsibility                                                                                                                                                                                                           | Do NOT put here                         |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------- |
| `src/utils/assignment.ts`         | Pure helpers for `ScheduleEntry.userId` (single `number` or `number[]` or `null`): `toAssignedUserIds`, `isAssignedInEntry`, `getAssignedCount`, `isManualType`, `isHistoryType`, `getLogicSchedule`, `getFirstDutyDate` | Business logic, DB calls, any state     |
| `src/services/userService.ts`     | User CRUD (Dexie), **`getUserAvailabilityStatus`** (the canonical availability oracle), `isUserAvailable`, `repayOwedDay`, debt/karma mutation, `syncUserIncompatibility`                                                | Schedule manipulation, comparator logic |
| `src/services/scheduleService.ts` | Schedule CRUD (Dexie), `countUserDaysOfWeek`, `calculateUserLoad`, `countUserAssignments`, `findScheduleConflicts`, `findScheduleGaps`                                                                                   | User mutation, comparator logic         |

---

## 3. Architecture Rules — NEVER Violate

### 3.1 Files that must not be split

**`helpers.ts` must never be split into sub-files.** It is imported simultaneously by
`comparator.ts`, `scheduler.ts`, `swapOptimizer.ts`, `decisionLog.ts`, and `index.ts`. Splitting it
would create circular import chains that TypeScript resolves non-deterministically, producing subtle
runtime bugs where a function is `undefined` at call time.

**`comparator.ts` must stay as a single unit.** The five filters (`filterByRestDays`,
`filterByIncompatiblePairs`, `filterBySameWeekdayLastWeek`, `filterByWeeklyCap`,
`filterForceUseAllWhenFew`) and `buildUserComparator` are tightly coupled: many filter fallback
conditions mirror comparator decisions. If they live in separate files an agent may "fix" one
without updating the other, silently breaking the invariant that `scheduler.ts` never has an empty
final pool.

### 3.2 Functions that must never be renamed

Renaming any of these will silently break callers across the codebase. Do not rename them even if
you think the name is suboptimal.

| Function                    | Lives in                                      |
| --------------------------- | --------------------------------------------- |
| `toAssignedUserIds`         | `src/utils/assignment.ts`                     |
| `getWeekWindow`             | `src/services/autoScheduler/helpers.ts`       |
| `getUserAvailabilityStatus` | `src/services/userService.ts`                 |
| `computeGlobalObjective`    | `src/services/autoScheduler/helpers.ts`       |
| `buildUserComparator`       | `src/services/autoScheduler/comparator.ts`    |
| `autoFillSchedule`          | `src/services/autoScheduler/scheduler.ts`     |
| `performSwapOptimization`   | `src/services/autoScheduler/swapOptimizer.ts` |
| `buildDecisionLog`          | `src/services/autoScheduler/decisionLog.ts`   |

### 3.3 Logic changes and refactoring must never happen in the same commit

A pure refactor (rename, extract, move) must have **zero diff** to observable scheduler output,
verifiable by running `npx vitest run` before and after. Any change to scheduling logic (weights,
filter conditions, priority order) must be a **separate commit** with a test that exercises the
changed behavior. Mixing both in one commit makes regressions impossible to bisect.

---

## 4. The Scheduler Algorithm — How It Works

### Pass 1 — Greedy Draft (`autoFillSchedule`)

Dates are processed in **ascending sorted order** (deterministic). For each date, up to
`dutiesPerDay` slots are filled sequentially.

```
allAutoUsers  ← users where isAutoParticipant(u) && not already selectedIds
hardPool      ← allAutoUsers where isHardEligible(u, date)
            (checks isActive + getUserAvailabilityStatus === 'AVAILABLE')

pool ← hardPool

if avoidConsecutiveDays:
    pool ← filterByRestDays(pool, date, minRestDays, tempSchedule)
        ↳ fallback: pool = hardPool  if result is empty

pool ← filterByIncompatiblePairs(pool, allUsers, date, tempSchedule)
        ↳ fallback: restore pre-filter pool  if result is empty

pool ← filterBySameWeekdayLastWeek(pool, date, tempSchedule, !options.evenWeeklyDistribution)
        ↳ fallback: restore pre-filter pool  if result is empty
        ↳ starvation exception: user with weeklyCount === 0 always passes
          (only when allowStarvationException=true, i.e. evenWeeklyDistribution is OFF)

totalEligibleCount ← countEligibleUsersForWeek(users, tempSchedule, date)
                     (NOT countEligibleUsersForDate)

if limitOneDutyPerWeekWhenSevenPlus:
    pool ← filterByWeeklyCap(pool, users, date, tempSchedule, options)
        ↳ gated: only applies when countEligibleUsersForWeek >= 7
        ↳ fallback: restore pre-filter pool  if result is empty

if forceUseAllWhenFew && totalEligibleCount <= MIN_USERS_FOR_WEEKLY_LIMIT:
    pool ← filterForceUseAllWhenFew(pool, date, tempSchedule)
        ↳ fallback: restore pre-filter pool  if result is empty

if evenWeeklyDistribution && totalEligibleCount <= MIN_USERS_FOR_WEEKLY_LIMIT:
    pool ← filterEvenWeeklyDistribution(pool, date, tempSchedule)
        ↳ restricts to users with minimum weeklyCount in pool
        ↳ fallback: restore pre-filter pool  if result is empty

if pool is empty:
    pool ← hardPool   ← STARVATION FALLBACK (soft filters all relaxed)

pool.sort(buildUserComparator(...))

selected ← first candidate from pool that passes isLookAheadSafe()
         ← falls back to pool[0] if no candidate is look-ahead safe

selectedIds.push(selected.id)
```

If `selectedIds` is empty after processing all slots, a `critical` entry is written to
`tempSchedule` (unassigned date flagged for the operator).

### Pass 2 — Swap Optimization (`performSwapOptimization`)

Runs after the greedy pass, only over dates that were **auto-filled** in Pass 1
(`autoFilledDateSet`). Iterates up to `getAdaptiveMaxIterations()` times. Each iteration runs three
phases in order; if any phase improves `Z`, the loop continues from phase 1.

**Acceptance criterion for all phases:**

```
accepted iff computeGlobalObjective(after) < computeGlobalObjective(before) - FLOAT_EPSILON
```

**Phase 1 — Pair-exchange swaps** Try every pair of auto-filled dates `(D1, D2)`. Tentatively swap
their assigned users. Accept if:

- Both users are `isHardEligible` at the swapped date.
- Neither would violate `wouldViolateIncompatiblePairs`.
- Neither would violate `wouldViolateRestDays`.
- Neither would create a same-DOW-consecutive-week repeat (`wouldCreateSameDowRepeat`).
- New objective `Z` is strictly lower.

**Phase 2 — Single-replacement swaps** For each auto-filled date, try replacing the assigned user
with every other hard-eligible, rest-day-safe, incompatible-pair-safe, **DOW-repeat-safe**
participant. Accept if new `Z` is strictly lower. Additional guard when `forceUseAllWhenFew`: block
replacement if it would leave the original user at 0 and push the candidate to ≥ 2 duties this week.

**Phase 3 — Targeted same-DOW-consecutive resolution** Find users with back-to-back same DOW exactly
7 days apart. For each such pair `(D1, D2)`, attempt to swap the repeat date `D2`'s user with the
user on any other auto-filled date. Uses the same hard-constraint checks as Phase 1. Acceptance
criterion: for small groups (`participants.length ≤ MIN_USERS_FOR_WEEKLY_LIMIT`), a swap is accepted
if `newObj < baseObj + 25.0` (relaxed tolerance), allowing slight objective degradation to resolve
DOW repeats that are otherwise impossible to fix in constrained groups. For larger groups, the
strict `newObj < baseObj - FLOAT_EPSILON` criterion is used (same as Phases 1–2).

After all iterations, decision logs are rebuilt for any entry whose assigned user changed during
swap optimization.

---

## 5. Critical Constants — Never Change Without Testing

All weights live inside `computeGlobalObjective` in `helpers.ts`.

| Constant                     | Value   | Why this exact value                                                                                                                                                                                                                                                                                                                                          |
| ---------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `W_SAME_DOW`                 | `50.0`  | Highest weight because same-DOW back-to-back weeks is the primary complaint from operators. Must dominate `W_SYSTEM_SSE` and `W_WITHIN_USER` at the margin of one extra repeat.                                                                                                                                                                               |
| `W_SYSTEM_SSE`               | `3.0`   | Cross-user DOW fairness — lower than `W_SAME_DOW` so the optimizer does not trade a same-DOW pair for slightly better cross-user balance.                                                                                                                                                                                                                     |
| `W_WITHIN_USER`              | `300.0` | **DO NOT change to 8.0.** See section 8. At 300 the zero-guard fires reliably before any per-user DOW imbalance can accumulate beyond one level. At 8 the objective landscape makes imbalanced patterns locally optimal and Phase 3 cannot resolve them.                                                                                                      |
| `W_LOAD_RANGE`               | `1.0`   | Soft pressure on the range `maxLoad − minLoad`. Kept at 1 so it never overrides DOW-fairness signals.                                                                                                                                                                                                                                                         |
| `W_ZERO_GUARD`               | `10.0`  | **Multiplier** on top of the internal `zeroGuardPenalty` which already starts at 5,000 per violation. Effective penalty for one violation = 10 × 5,000 = 50,000 — far above any sum of other terms, making it an absolute veto. Reducing this multiplier to 1 causes the guard to become bypassable by a combination of same-DOW and system-SSE improvements. |
| `W_TOTAL_SSE`                | `100.0` | Anti-concentration: prevents the optimizer from concentrating all duties on one user (improving their DOW variance) while starving others. Without this term, Phase 2 single-replacement swaps can converge to a pathological solution.                                                                                                                       |
| `MIN_USERS_FOR_WEEKLY_LIMIT` | `7`     | Threshold at which `filterByWeeklyCap` and `forceUseAllWhenFew` activate. Below 7 active users, strict weekly limits would leave dates unassigned.                                                                                                                                                                                                            |
| `BASE_SWAP_ITERATIONS`       | `1500`  | Default cap for `getAdaptiveMaxIterations`. Scaled by `min(1500, max(200, userCount × dateCount × 2))`, capped at 3000. Empirically: groups of 3–10 users converge well before 500 iterations; 1500 gives safety margin for 30-user groups.                                                                                                                   |
| `FLOAT_EPSILON`              | `1e-9`  | Prevents infinite swap loops where floating-point noise creates illusory improvements. Without this guard, Phase 1 can cycle indefinitely on schedules that are already globally optimal.                                                                                                                                                                     |

### Zero-guard penalty math

For a user assigned `total` duties across `activeDows` non-blocked days-of-week:

- `idealSpread = 0` if `total % activeDows === 0`, else `1`
- `actualSpread = maxDowCount − minDowCount` (over non-blocked DOWs)
- Penalty fires when `actualSpread > idealSpread`
- `zeroGuardPenalty += 5000 + 2500 × (actualSpread − idealSpread)`

With `W_ZERO_GUARD = 10`, one violation contributes a minimum of 50,000 to `Z`. This is
intentionally catastrophic so the optimizer never accepts any swap that introduces or worsens a DOW
imbalance.

---

## 6. Filter Pipeline — Rules

All five filters follow the **empty-pool fallback contract**: if applying the filter would leave
zero candidates, the filter is silently skipped and the pre-filter pool is restored. This ensures
the scheduler always makes some assignment rather than producing a `critical` gap.

### `filterByRestDays`

- **What it does:** Removes users who have an assignment within `minRestDays` calendar days before
  **or** after `dateStr` in `tempSchedule`.
- **Forward check note:** During the greedy pass, future dates are not yet filled, so the forward
  check only catches locked/manual/previously-run entries. During swap optimization all dates are
  filled, making the forward check fully effective.
- **Fallback:** Returns original pool if filtered set is empty.
- **Counts:** Uses raw date arithmetic — not week-based.

### `filterByIncompatiblePairs`

- **What it does:** Removes any candidate whose `incompatibleWith` array contains a neighbor's ID,
  and any candidate whose ID appears in a neighbor's `incompatibleWith`. Check is bidirectional.
  Neighbors are the entries at `date − 1 day` and `date + 1 day`.
- **Fallback:** Returns original pool if filtered set is empty.

### `filterBySameWeekdayLastWeek`

- **What it does:** Removes users who served the same day-of-week exactly 7 days ago
  (`didUserServeSameWeekdayLastWeek`).
- **Starvation exception (`allowStarvationException=true`):** A user with `weeklyCount === 0` for
  the current week always passes through — their coverage fairness takes precedence over DOW-repeat
  avoidance. **Only active when `evenWeeklyDistribution` is OFF.** When `evenWeeklyDistribution` is
  ON, `filterEvenWeeklyDistribution` already guarantees round-robin fairness; the exception becomes
  unnecessary and causes DOW repeats by allowing the same person onto the same weekday two weeks
  running. When `evenWeeklyDistribution=ON`, `allowStarvationException=false` is passed from
  `scheduler.ts`, `getFreeUsersForDate`, and `calculateOptimalAssignment`.
- **Fallback:** Returns original pool if filtered set is empty.

### `filterByWeeklyCap`

- **What it does:** Removes users who have already reached their weekly assignment cap
  (`getWeeklyAssignmentCap`, normally 1, higher for debt users).
- **Critical:** Uses **`countEligibleUsersForWeek`** to decide whether the cap is active (threshold
  `< MIN_USERS_FOR_WEEKLY_LIMIT`). Must NOT use `countEligibleUsersForDate`. A low-availability
  Friday (e.g., 3 people available that day) must not disable the weekly cap for the whole week —
  the week-level count properly reflects that 8 people are available across the week.
- **Fallback:** Returns original pool if `< 1` user passes.

### `filterForceUseAllWhenFew`

- **What it does:** While any user in the pool has `weeklyCount === 0`, restricts the pool to
  zero-assignment users only. Enforces the hard "no second duty until everyone has one" invariant.
- **Critical:** The gate check in `scheduler.ts` uses **`countEligibleUsersForWeek`** (NOT
  `countEligibleUsersForDate`). The same `≤ MIN_USERS_FOR_WEEKLY_LIMIT` condition is mirrored in
  `buildUserComparator` at priority −1.
- **Fallback:** Returns original pool if zero-assignment set is empty.

### `filterEvenWeeklyDistribution`

- **What it does:** Restricts the pool to users with the **minimum weekly assignment count**
  (`weeklyCount === min`). Extends `filterForceUseAllWhenFew` to all rounds: nobody gets a 2nd duty
  while someone has 1; nobody a 3rd while someone has 2; and so on. Prevents "3–1–1" patterns in
  small groups of any duty count.
- **When all counts are equal:** Returns the full pool unchanged (no-op). No fallback needed.
- **Critical:** Same gate as `filterForceUseAllWhenFew` — uses **`countEligibleUsersForWeek`** and
  the same `≤ MIN_USERS_FOR_WEEKLY_LIMIT` threshold. Applied **after** `filterForceUseAllWhenFew` in
  the pipeline; when both are enabled they are complementary (forceUse = round 1 only,
  evenDistribution = all rounds).
- **Fallback:** Returns original pool if restricted set is empty (cannot happen in practice).

---

## 7. Comparator Priority Order

`buildUserComparator` returns a comparator `(a, b) => number`. Negative = `a` ranks first; positive
= `b` ranks first.

| Priority | Name                   | Logic                                                            | Notes                                                                                                                                                                                                                                                                                                                                                                                   |
| -------- | ---------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **−2**   | Cross-DOW zero guard   | `getCrossDowGuard(a)` vs `getCrossDowGuard(b)`                   | Penalty = `5000 + 2500 × (thisDowCount − minDow + 1)` when `maxDow > minDow` AND `thisDowCount > minDow`. Zero if user is already at min. **Must precede forceUseAll** so that DOW diversity is respected even when all users are being forced. Previously only triggered when `minDow === 0`; fixed to also fire when `minDow ≥ 1` and there is still imbalance (e.g., `[1,3,1,...]`). |
| **−1**   | forceUseAllWhenFew     | `weekCount === 0 ? 1 : 0`, descending                            | Only active when `forceUseAllWhenFew` is enabled and `totalEligibleCount ≤ 7`. A zero-duty user beats all non-zero users unconditionally.                                                                                                                                                                                                                                               |
| **0**    | DOW count              | `dowCount`, ascending                                            | First regular criterion. Strict DOW fairness account — user with fewest duties on this day-of-week goes first.                                                                                                                                                                                                                                                                          |
| **1**    | Post-assignment SSE    | `computeDowFairnessObjective`, ascending                         | Lower SSE after hypothetical assignment = better balance across the group for this DOW.                                                                                                                                                                                                                                                                                                 |
| **2**    | Same-DOW penalty       | Exponential: 7d = 100, 14d = 25, 21d = 6.25, >28d = 0, ascending | Soft, not a hard block. The scheduler works very hard to avoid same-DOW consecutive weeks but will still assign if all alternatives are worse.                                                                                                                                                                                                                                          |
| **3**    | Weekly cap tie-break   | `weekCount`, ascending                                           | Only active when `limitOneDutyPerWeekWhenSevenPlus` is on and `totalEligibleCount ≥ 7`.                                                                                                                                                                                                                                                                                                 |
| **4**    | DOW recency            | `daysSinceLastSameDowAssignment`, descending (longer gap first)  | Rotates users through the same DOW over longer time horizons.                                                                                                                                                                                                                                                                                                                           |
| **5**    | Remaining availability | `getForceUseRemainingAvailability`, ascending                    | Only active in forceUse mode. Users with fewer remaining available days get assigned sooner (avoids stranding them).                                                                                                                                                                                                                                                                    |
| **6**    | Load Rate              | `computeUserLoadRate = total / daysActive`, ascending            | Normalized by days active — prevents newcomers being overloaded by comparison to veterans.                                                                                                                                                                                                                                                                                              |
| **7**    | Load balancing         | `calculateUserLoad + debt`, ascending                            | Only active when `options.considerLoad`.                                                                                                                                                                                                                                                                                                                                                |
| **8**    | Wait days              | `daysSinceLastAssignment`, descending (longer wait first)        | Classic round-robin tiebreak.                                                                                                                                                                                                                                                                                                                                                           |
| **9**    | Stable tie-break       | `a.id - b.id`, ascending                                         | Deterministic; prevents non-reproducible output across identical inputs.                                                                                                                                                                                                                                                                                                                |

---

## 8. Known Regressions — Do Not Repeat

### Regression 1: `W_WITHIN_USER` changed from 300 → 8

**What happened:** An agent (or developer) saw `W_WITHIN_USER = 8.0` in a stale JSDoc comment and
"corrected" the code to match the comment.

**Effect:** At weight 8, the per-user DOW variance term becomes too weak to compete with
`W_SAME_DOW`. The swap optimizer found locally optimal schedules where one user got assigned to the
same day-of-week 3 weeks in a row — each individual swap looked like an improvement under the
reduced weight, but the global pattern was a regression.

**Fix:** `W_WITHIN_USER = 300.0`. The JSDoc comment was wrong, not the code. The comment has since
been removed from the JSDoc but the risk of re-introducing 8.0 remains.

### Regression 2: `W_ZERO_GUARD` changed from 10 → 1

**What happened:** The internal `zeroGuardPenalty` calculation already uses values ≥ 5,000. An agent
concluded the outer multiplier was redundant and reduced it to 1 ("to avoid over-penalizing").

**Effect:** The effective minimum penalty dropped from 50,000 to 5,000. A combination of
`W_SAME_DOW` improvements across 2–3 dates could now outweigh one zero-guard violation, making it
profitable for the optimizer to concentrate all duties on one DOW. On a 5-user group this produced
schedules where one user had 0 Mondays and 5 Fridays.

**Fix:** `W_ZERO_GUARD = 10.0`. The multiplier is intentional and must stay.

### Regression 3: `filterByWeeklyCap` and `filterForceUseAllWhenFew` gate using `countEligibleUsersForDate` instead of `countEligibleUsersForWeek`

**What happened:** When refactoring the filter pipeline, the count function was substituted with the
"more precise" per-date variant.

**Effect:** On a Friday with only 3 people available (others on leave), the cap and forceUse switch
both turned off — even though 9 people are eligible across the week. This caused users who already
had 2 duties that week to be selected, violating the 1-per-week fairness policy.

**Fix:** Both gates use `countEligibleUsersForWeek`. This is the correct semantic: "are there enough
users in this week's pool to make the policy meaningful?"

### Regression 4: `getFreeUsersForDate` in `index.ts` missing `filterForceUseAllWhenFew`

**What happened:** The UI "free candidates for date" function was implemented using only
`filterByWeeklyCap` + `filterByIncompatiblePairs` + `filterBySameWeekdayLastWeek`, without the
`filterForceUseAllWhenFew` step that the actual scheduler applies.

**Effect:** The UI candidate list showed users in a different order than what `autoFillSchedule`
actually selected. Operators saw candidate A ranked first in the modal but the auto-scheduler
assigned candidate B — with no visible explanation. The fix added the same forceUse gate (using
`countEligibleUsersForWeek`) to `getFreeUsersForDate`.

### Regression 5: `filterBySameWeekdayLastWeek` starvation exception active when `evenWeeklyDistribution=ON`

**What happened:** `filterBySameWeekdayLastWeek` has a starvation exception: a user with
`weeklyCount === 0` always passes through even if they served the same DOW last week. When
`evenWeeklyDistribution` was added, this exception was left unconditional.

**Effect:** With `evenWeeklyDistribution=ON`, both filters run. A user with 0 duties this week
passes `filterBySameWeekdayLastWeek` (starvation exception), then `filterEvenWeeklyDistribution`
restricts the pool to zero-duty users — leaving this same user as the only candidate. Result: the
same person gets assigned to the same day-of-week two weeks in a row, exactly the problem both
filters were supposed to prevent.

**Fix:** `filterBySameWeekdayLastWeek` accepts an `allowStarvationException` parameter (default
`true`). Callers pass `!options.evenWeeklyDistribution` — disabling the exception when
`evenWeeklyDistribution` is ON. This is safe because `filterEvenWeeklyDistribution` already prevents
starvation via strict round-robin, making the exception redundant.

---

## 9. What Is Safe to Change vs Dangerous

### SAFE — no risk of scheduler regression

- All React UI components in `src/components/`
- All SCSS in `src/styles/`
- Ukrainian user-facing strings in `src/services/autoScheduler/decisionLog.ts` (the `DOW_NAMES`,
  `DOW_NAMES_NOMINATIVE`, `DOW_SHORT`, `REASON_UA` maps, and all text in `buildDecisionLog`
  sections)
- Adding **new** exported functions to any file (without removing or modifying existing ones)
- Adding **new** test cases to `tests/`
- Changes to Tauri configuration (`src-tauri/`)
- `src/services/auditService.ts`, `src/services/exportService.ts`,
  `src/services/workspaceService.ts`
- `src/utils/constants.ts` (non-scheduler constants only)

### DANGEROUS — requires full regression testing on real backup data before commit

Any change to the following will likely affect scheduler output:

| Change                                                                                                                                | Why dangerous                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Any weight in `computeGlobalObjective` (`W_SAME_DOW`, `W_SYSTEM_SSE`, `W_WITHIN_USER`, `W_LOAD_RANGE`, `W_ZERO_GUARD`, `W_TOTAL_SSE`) | Shifts the objective landscape; previously optimal schedules may become suboptimal and vice versa                                                                                                                           |
| Filter pipeline order in `scheduler.ts` (`autoFillSchedule`)                                                                          | The starvation fallback, pool state, and `selectedIds` accumulation all depend on the exact sequence                                                                                                                        |
| Comparator priority order in `buildUserComparator`                                                                                    | Any reordering changes which fairness criterion "wins" at every tie                                                                                                                                                         |
| `getCrossDowGuard` penalty formula                                                                                                    | Breakage of the absolute-law invariant; DOW imbalance becomes locally profitable                                                                                                                                            |
| `filterBySameWeekdayLastWeek` starvation exception (`allowStarvationException` parameter)                                             | The exception must be ON when `evenWeeklyDistribution=OFF` (prevents user starvation). It must be OFF when `evenWeeklyDistribution=ON` (otherwise the two filters conflict and produce same-DOW repeats). See Regression 5. |
| `filterByWeeklyCap` and `filterForceUseAllWhenFew` gate functions (must stay `ForWeek`)                                               | See Regression 3                                                                                                                                                                                                            |
| `computeDaysActive` in `helpers.ts` (unavailability normalization)                                                                    | Changing how `daysActive` is computed directly affects `computeUserLoadRate` and all fairness comparisons                                                                                                                   |
| `autoFillSchedule` function body                                                                                                      | Any change here must not alter the greedy pass outcome or swap result for any deterministic input                                                                                                                           |
| Anything in `helpers.ts` imported by 3+ other files                                                                                   | High blast radius; type-check alone is insufficient to catch semantic regressions                                                                                                                                           |

---

## 10. Language Policy

| Location                                                | Required language                                                       |
| ------------------------------------------------------- | ----------------------------------------------------------------------- |
| All TypeScript code comments                            | **English only**                                                        |
| Ukrainian strings in UI components and `decisionLog.ts` | **Keep as-is** — do not translate to English, do not "improve" phrasing |
| `README.md`, `README.uk.md`                             | English / Ukrainian respectively — update when features change          |
| `AGENTS.md`                                             | **English only**                                                        |

---

## 11. Documentation Sync Rule

After **every code change**, check whether documentation needs updating. This is mandatory —
documentation drift is a known source of confusion for both agents and human operators.

### What to update after a change

| Trigger                                                 | Files to update                                                                                            |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Tech stack, architecture, new/removed files             | `README.md`, `README.uk.md`                                                                                |
| New or removed feature visible to the user              | `README.md`, `README.uk.md`, `InfoModalContent.tsx`                                                        |
| New `AutoScheduleOptions` parameter                     | `README.md` (options table), `README.uk.md` (options table), `InfoModalContent.tsx` (налаштування section) |
| Scheduler logic, comparator priorities, filter behavior | `README.md`, `README.uk.md`, `AGENTS.md` (relevant section)                                                |
| New interface tab, button, or major UI element          | `InfoModalContent.tsx` (Вкладки / Інтерфейс), `InfoLegendTables.tsx` if it affects legends                 |
| Cell type, icon type, or print mode added/removed       | `InfoLegendTables.tsx` (`CellLegendTable`, `IconLegendTable`, `TabsTable`)                                 |

### Rules

- **Do NOT** update docs for pure refactoring with zero behavior change.
- **Do NOT** update docs for style/SCSS-only changes.
- **Do NOT** update docs for test-only changes.
- When updating `README.md` / `README.uk.md`, follow the existing section structure and language
  (English / Ukrainian respectively).
- When updating in-app help (`InfoModalContent.tsx`, `InfoLegendTables.tsx`), match the existing
  tone and Ukrainian language. Do not translate existing Ukrainian strings to English.
- The checklist in Section 12 includes a documentation step — do not skip it.

---

## 12. Before You Change Anything — Checklist

Run through every item below before writing a single line:

- [ ] Did I read the relevant section of `AGENTS.md` for the area I am changing?
- [ ] Is this a **logic change** or a **refactor**? They must be separate commits.
- [ ] Does the change affect any function listed in Section 3.2 (never rename)?
- [ ] Does the change touch any constant listed in Section 5?
- [ ] Does the change alter the filter pipeline order (Section 6)?
- [ ] Does the change alter the comparator priority order (Section 7)?
- [ ] Have I verified that all five filters preserve their **empty-pool fallback** behavior?
- [ ] Does the change use `countEligibleUsersForWeek` where required (Section 6, Regression 3)?
- [ ] Will this produce correct behavior on a **3-user group** (extreme low count) AND a **10-user
      group** (normal count)?
- [ ] Did I run `npx vitest run` and confirm no new test failures?
- [ ] If I changed a weight or threshold, did I test on at least one real exported backup (`.json`)
      by comparing the before/after schedule for a full 4-week window?
- [ ] Did I apply the Documentation Sync Rule (Section 11) — updated `README.md`, `README.uk.md`,
      `InfoModalContent.tsx`, and/or `InfoLegendTables.tsx` as required by the change?
