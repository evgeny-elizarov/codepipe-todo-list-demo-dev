import type { CategoryPayload, TaskPayload } from "../services/todoApi";
import { toIso } from "../services/todoApi";
import type { Category, Task, UUID, User } from "../types/user";

/**
 * Pure merge/diff core for the optional backend sync.
 *
 * Deliberately free of React and `fetch` so it can be unit-tested as a plain
 * module. Sits beside `syncUtils.ts` (the p2p/WebRTC merge) without sharing
 * anything with it — the two solve different problems.
 *
 * The model is a *snapshot*: a record of what we believe the server currently
 * holds, keyed by id and valued by a canonical JSON encoding of the payload.
 * Pending work is always recomputed as `diff(snapshot, current state)` rather
 * than accumulated in a queue, which makes change detection content-based
 * (object identity churns constantly — see `Categories.tsx`) and makes a
 * partially-failed flush self-healing.
 */

/** What we believe the server holds: id → canonical payload JSON. */
export interface SyncSnapshot {
  tasks: Map<UUID, string>;
  categories: Map<UUID, string>;
}

export type SyncOp =
  | { kind: "category.create"; id: UUID; body: CategoryPayload }
  | { kind: "category.update"; id: UUID; body: CategoryPayload }
  | { kind: "category.delete"; id: UUID }
  | { kind: "task.create"; id: UUID; body: TaskPayload }
  | { kind: "task.update"; id: UUID; body: TaskPayload }
  | { kind: "task.delete"; id: UUID };

/** The slice of `User` the sync actually reads. */
export type SyncableUser = Pick<
  User,
  "tasks" | "categories" | "deletedTasks" | "deletedCategories"
>;

export interface ServerState {
  tasks: Task[];
  categories: Category[];
}

const timestamp = (value: Date | string | undefined): number => {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return isNaN(time) ? 0 : time;
};

// ---------------------------------------------------------------------------
// Canonical payloads
// ---------------------------------------------------------------------------

/**
 * Builds the wire payload for a category.
 *
 * The key order is a fixed literal and every absent value is normalised to
 * `null`, so `JSON.stringify` of the result is a stable content fingerprint.
 *
 * A field missing here is invisible to the diff and will silently never sync —
 * adding one to `Category` means editing this function too.
 */
export const canonicalCategoryPayload = (category: Category): CategoryPayload => ({
  id: category.id,
  name: category.name,
  emoji: category.emoji ?? null,
  color: category.color,
  lastSave: toIso(category.lastSave),
});

/** Builds the wire payload for a task. Category references are reduced to sorted ids. */
export const canonicalTaskPayload = (task: Task): TaskPayload => ({
  id: task.id,
  done: task.done ?? false,
  pinned: task.pinned ?? false,
  name: task.name,
  description: task.description ?? null,
  emoji: task.emoji ?? null,
  color: task.color,
  date: toIso(task.date) ?? new Date(0).toISOString(),
  deadline: toIso(task.deadline),
  lastSave: toIso(task.lastSave),
  position: task.position ?? null,
  category: (task.category ?? [])
    .map((c) => c.id)
    .sort()
    .map((id) => ({ id })),
});

const encode = (payload: CategoryPayload | TaskPayload): string => JSON.stringify(payload);

// ---------------------------------------------------------------------------
// Snapshot
// ---------------------------------------------------------------------------

/** The snapshot implied by what the server just told us it has. */
export const snapshotFromServer = (tasks: Task[], categories: Category[]): SyncSnapshot => ({
  tasks: new Map(tasks.map((task) => [task.id, encode(canonicalTaskPayload(task))])),
  categories: new Map(
    categories.map((category) => [category.id, encode(canonicalCategoryPayload(category))]),
  ),
});

/** Records a successfully applied operation, so the next diff no longer emits it. */
export const advanceSnapshot = (snapshot: SyncSnapshot, op: SyncOp): void => {
  switch (op.kind) {
    case "category.create":
    case "category.update":
      snapshot.categories.set(op.id, encode(op.body));
      break;
    case "category.delete":
      snapshot.categories.delete(op.id);
      break;
    case "task.create":
    case "task.update":
      snapshot.tasks.set(op.id, encode(op.body));
      break;
    case "task.delete":
      snapshot.tasks.delete(op.id);
      break;
  }
};

// ---------------------------------------------------------------------------
// Diff
// ---------------------------------------------------------------------------

/**
 * Derives the operations needed to bring the server from `snapshot` to the
 * given local state.
 *
 * The emission order is load-bearing and must not be collapsed into a single
 * pass: categories are created before the tasks that reference them, and tasks
 * stop referencing a category before it is removed.
 */
export const diffAgainstSnapshot = (
  snapshot: SyncSnapshot,
  tasks: Task[],
  categories: Category[],
): SyncOp[] => {
  const ops: SyncOp[] = [];

  for (const category of categories) {
    const body = canonicalCategoryPayload(category);
    const previous = snapshot.categories.get(category.id);
    const next = encode(body);
    if (previous === undefined) {
      ops.push({ kind: "category.create", id: category.id, body });
    } else if (previous !== next) {
      ops.push({ kind: "category.update", id: category.id, body });
    }
  }

  for (const task of tasks) {
    const body = canonicalTaskPayload(task);
    const previous = snapshot.tasks.get(task.id);
    const next = encode(body);
    if (previous === undefined) {
      ops.push({ kind: "task.create", id: task.id, body });
    } else if (previous !== next) {
      ops.push({ kind: "task.update", id: task.id, body });
    }
  }

  // Deletion is "was in the snapshot, is gone locally". The `deletedTasks` /
  // `deletedCategories` arrays are not consulted: `TasksList.tsx` pushes onto
  // `deletedTasks` in place, so they are not a reliable change signal.
  const localTaskIds = new Set(tasks.map((task) => task.id));
  for (const id of snapshot.tasks.keys()) {
    if (!localTaskIds.has(id)) ops.push({ kind: "task.delete", id });
  }

  const localCategoryIds = new Set(categories.map((category) => category.id));
  for (const id of snapshot.categories.keys()) {
    if (!localCategoryIds.has(id)) ops.push({ kind: "category.delete", id });
  }

  return ops;
};

// ---------------------------------------------------------------------------
// Merge
// ---------------------------------------------------------------------------

export interface MergeResult {
  tasks: Task[];
  categories: Category[];
  changed: boolean;
}

/**
 * Merges the server's view into the local one, last-write-wins on `lastSave`.
 *
 * The comparison is **strictly greater**, mirroring `syncUtils.ts`, so ties and
 * missing timestamps keep the local copy: `localStorage` is the source of truth
 * for the UI, and several mutation sites deliberately do not bump `lastSave`.
 *
 * Tombstoned ids are skipped so the server cannot resurrect something deleted
 * while offline — the following diff will emit the `DELETE` for it.
 */
export const mergeFromServer = (local: SyncableUser, server: ServerState): MergeResult => {
  const deletedTasks = new Set(local.deletedTasks);
  const deletedCategories = new Set(local.deletedCategories);

  const categories = [...local.categories];
  let categoriesChanged = false;

  for (const remote of server.categories) {
    if (deletedCategories.has(remote.id)) continue;
    const index = categories.findIndex((category) => category.id === remote.id);
    if (index === -1) {
      categories.push(remote);
      categoriesChanged = true;
    } else if (timestamp(remote.lastSave) > timestamp(categories[index].lastSave)) {
      categories[index] = remote;
      categoriesChanged = true;
    }
  }

  const categoryById = new Map(categories.map((category) => [category.id, category]));

  const tasks = [...local.tasks];
  let tasksChanged = false;

  for (const remote of server.tasks) {
    if (deletedTasks.has(remote.id)) continue;

    // Drop references to categories that no longer exist here.
    const resolved: Task = {
      ...remote,
      category: (remote.category ?? [])
        .map((category) => categoryById.get(category.id))
        .filter((category): category is Category => category !== undefined),
    };

    const index = tasks.findIndex((task) => task.id === remote.id);
    if (index === -1) {
      tasks.push(resolved);
      tasksChanged = true;
    } else if (timestamp(remote.lastSave) > timestamp(tasks[index].lastSave)) {
      // `sharedBy` is not a server column, so keep whatever the local copy knew.
      tasks[index] = { ...resolved, sharedBy: resolved.sharedBy ?? tasks[index].sharedBy };
      tasksChanged = true;
    }
  }

  return {
    tasks: tasksChanged ? tasks : local.tasks,
    categories: categoriesChanged ? categories : local.categories,
    changed: tasksChanged || categoriesChanged,
  };
};
