import type { Category, Task, UUID } from "../../types/user";
import {
  diffAgainstSnapshot,
  mergeFromServer,
  snapshotFromServer,
  type SyncableUser,
} from "../apiSyncUtils";

/** The state before the first successful pull: the server holds nothing. */
const emptySnapshot = () => snapshotFromServer([], []);

const CAT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" as UUID;
const CAT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" as UUID;
const TASK_1 = "11111111-1111-4111-8111-111111111111" as UUID;
const TASK_2 = "22222222-2222-4222-8222-222222222222" as UUID;

const category = (id: UUID, overrides: Partial<Category> = {}): Category => ({
  id,
  name: "Home",
  emoji: "1f3e0",
  color: "#53e45d",
  lastSave: new Date("2026-01-01T10:00:00Z"),
  ...overrides,
});

const task = (id: UUID, overrides: Partial<Task> = {}): Task => ({
  id,
  done: false,
  pinned: false,
  name: "Buy milk",
  color: "#248eff",
  date: new Date("2026-01-01T09:00:00Z"),
  lastSave: new Date("2026-01-01T10:00:00Z"),
  ...overrides,
});

const local = (overrides: Partial<SyncableUser> = {}): SyncableUser => ({
  tasks: [],
  categories: [],
  deletedTasks: [],
  deletedCategories: [],
  ...overrides,
});

describe("diffAgainstSnapshot", () => {
  it("emits nothing when the snapshot matches the local state", () => {
    const tasks = [task(TASK_1)];
    const categories = [category(CAT_A)];
    const snapshot = snapshotFromServer(tasks, categories);

    expect(diffAgainstSnapshot(snapshot, tasks, categories)).toEqual([]);
  });

  it("emits nothing when every object is replaced but the content is identical", () => {
    // Categories.tsx and TaskProvider.tsx rebuild every task object when a
    // single category changes, so identity is not a usable change signal.
    const tasks = [task(TASK_1), task(TASK_2, { name: "Walk dog" })];
    const snapshot = snapshotFromServer(tasks, []);
    const rebuilt = tasks.map((t) => ({ ...t }));

    expect(diffAgainstSnapshot(snapshot, rebuilt, [])).toEqual([]);
  });

  it("treats a Date and the equivalent ISO string as the same content", () => {
    // useStorageState round-trips through JSON, so after a reload the date
    // fields are strings at runtime despite being typed Date.
    const original = [task(TASK_1)];
    const snapshot = snapshotFromServer(original, []);
    const afterReload = [
      { ...original[0], date: "2026-01-01T09:00:00.000Z", lastSave: "2026-01-01T10:00:00.000Z" },
    ] as unknown as Task[];

    expect(diffAgainstSnapshot(snapshot, afterReload, [])).toEqual([]);
  });

  it("emits nothing when a task's category list is only reordered", () => {
    const categories = [category(CAT_A), category(CAT_B, { name: "Work" })];
    const tasks = [task(TASK_1, { category: [categories[0], categories[1]] })];
    const snapshot = snapshotFromServer(tasks, categories);

    const reordered = [{ ...tasks[0], category: [categories[1], categories[0]] }];
    expect(diffAgainstSnapshot(snapshot, reordered, categories)).toEqual([]);
  });

  it("emits a create for a task the server has never seen", () => {
    const ops = diffAgainstSnapshot(emptySnapshot(), [task(TASK_1)], []);

    expect(ops).toHaveLength(1);
    expect(ops[0].kind).toBe("task.create");
    expect(ops[0].id).toBe(TASK_1);
  });

  it("emits an update only for the task that changed", () => {
    const tasks = [task(TASK_1), task(TASK_2, { name: "Walk dog" })];
    const snapshot = snapshotFromServer(tasks, []);

    const ops = diffAgainstSnapshot(snapshot, [tasks[0], { ...tasks[1], name: "Walk cat" }], []);

    expect(ops).toEqual([expect.objectContaining({ kind: "task.update", id: TASK_2 })]);
  });

  it("derives a deletion from the tasks array, not from deletedTasks", () => {
    // TasksList.tsx pushes onto deletedTasks in place without setUser, so the
    // tombstone array can never be a reliable change signal.
    const snapshot = snapshotFromServer([task(TASK_1), task(TASK_2)], []);

    const ops = diffAgainstSnapshot(snapshot, [task(TASK_1)], []);

    expect(ops).toEqual([{ kind: "task.delete", id: TASK_2 }]);
  });

  it("creates categories before the tasks that reference them", () => {
    const cat = category(CAT_A);
    const ops = diffAgainstSnapshot(emptySnapshot(), [task(TASK_1, { category: [cat] })], [cat]);

    expect(ops.map((op) => op.kind)).toEqual(["category.create", "task.create"]);
  });

  it("deletes tasks before the categories they referenced", () => {
    const cat = category(CAT_A);
    const snapshot = snapshotFromServer([task(TASK_1, { category: [cat] })], [cat]);

    const ops = diffAgainstSnapshot(snapshot, [], []);

    expect(ops).toEqual([
      { kind: "task.delete", id: TASK_1 },
      { kind: "category.delete", id: CAT_A },
    ]);
  });
});

describe("mergeFromServer", () => {
  it("adds entities the server has and the client does not", () => {
    const result = mergeFromServer(local(), {
      tasks: [task(TASK_1)],
      categories: [category(CAT_A)],
    });

    expect(result.changed).toBe(true);
    expect(result.tasks.map((t) => t.id)).toEqual([TASK_1]);
    expect(result.categories.map((c) => c.id)).toEqual([CAT_A]);
  });

  it("lets a strictly newer server copy win", () => {
    const result = mergeFromServer(local({ tasks: [task(TASK_1, { name: "old" })] }), {
      tasks: [task(TASK_1, { name: "new", lastSave: new Date("2026-01-02T10:00:00Z") })],
      categories: [],
    });

    expect(result.changed).toBe(true);
    expect(result.tasks[0].name).toBe("new");
  });

  it("keeps the local copy when lastSave ties", () => {
    const result = mergeFromServer(local({ tasks: [task(TASK_1, { name: "local" })] }), {
      tasks: [task(TASK_1, { name: "server" })],
      categories: [],
    });

    expect(result.changed).toBe(false);
    expect(result.tasks[0].name).toBe("local");
  });

  it("keeps the local copy when neither side has a lastSave", () => {
    const result = mergeFromServer(
      local({ tasks: [task(TASK_1, { name: "local", lastSave: undefined })] }),
      { tasks: [task(TASK_1, { name: "server", lastSave: undefined })], categories: [] },
    );

    expect(result.tasks[0].name).toBe("local");
  });

  it("reports changed === false and preserves array identity for a no-op merge", () => {
    const state = local({ tasks: [task(TASK_1)], categories: [category(CAT_A)] });

    const result = mergeFromServer(state, {
      tasks: [task(TASK_1)],
      categories: [category(CAT_A)],
    });

    expect(result.changed).toBe(false);
    expect(result.tasks).toBe(state.tasks);
    expect(result.categories).toBe(state.categories);
  });

  it("does not resurrect a tombstoned entity, and the next diff deletes it", () => {
    const state = local({ deletedTasks: [TASK_1] });
    const serverTasks = [task(TASK_1)];

    const merged = mergeFromServer(state, { tasks: serverTasks, categories: [] });
    expect(merged.tasks).toEqual([]);

    const snapshot = snapshotFromServer(serverTasks, []);
    expect(diffAgainstSnapshot(snapshot, merged.tasks, merged.categories)).toEqual([
      { kind: "task.delete", id: TASK_1 },
    ]);
  });

  it("preserves the local sharedBy when the server copy wins", () => {
    // sharedBy is not a server column, so a shared task must not lose it.
    const result = mergeFromServer(local({ tasks: [task(TASK_1, { sharedBy: "Maciej" })] }), {
      tasks: [task(TASK_1, { lastSave: new Date("2026-01-02T10:00:00Z") })],
      categories: [],
    });

    expect(result.tasks[0].sharedBy).toBe("Maciej");
  });

  it("drops references to categories that were deleted locally", () => {
    const result = mergeFromServer(local({ deletedCategories: [CAT_A] }), {
      tasks: [task(TASK_1, { category: [category(CAT_A)] })],
      categories: [category(CAT_A)],
    });

    expect(result.categories).toEqual([]);
    expect(result.tasks[0].category).toEqual([]);
  });
});
