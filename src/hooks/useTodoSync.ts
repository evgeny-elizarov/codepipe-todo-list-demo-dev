import { useCallback, useEffect, useRef, useState } from "react";
import {
  TodoApiError,
  createCategory,
  createTask,
  deleteCategory,
  deleteTask,
  fetchCategories,
  fetchTasks,
  updateCategory,
  updateTask,
} from "../services/todoApi";
import type { User } from "../types/user";
import type { SyncOp, SyncSnapshot } from "../utils/apiSyncUtils";
import {
  advanceSnapshot,
  diffAgainstSnapshot,
  mergeFromServer,
  snapshotFromServer,
} from "../utils/apiSyncUtils";
import { useOnlineStatus } from "./useOnlineStatus";

/** Backoff between reconcile attempts while the backend is unreachable. */
const RETRY_DELAYS_MS = [30_000, 60_000, 120_000, 300_000];

const isCreate = (op: SyncOp) => op.kind === "category.create" || op.kind === "task.create";
const isUpdate = (op: SyncOp) => op.kind === "category.update" || op.kind === "task.update";
const isDelete = (op: SyncOp) => op.kind === "category.delete" || op.kind === "task.delete";

const asUpdate = (op: SyncOp): SyncOp => {
  if (op.kind === "category.create") return { ...op, kind: "category.update" };
  if (op.kind === "task.create") return { ...op, kind: "task.update" };
  return op;
};

const asCreate = (op: SyncOp): SyncOp => {
  if (op.kind === "category.update") return { ...op, kind: "category.create" };
  if (op.kind === "task.update") return { ...op, kind: "task.create" };
  return op;
};

const send = async (op: SyncOp): Promise<void> => {
  switch (op.kind) {
    case "category.create":
      await createCategory(op.body);
      return;
    case "category.update":
      await updateCategory(op.id, op.body);
      return;
    case "category.delete":
      await deleteCategory(op.id);
      return;
    case "task.create":
      await createTask(op.body);
      return;
    case "task.update":
      await updateTask(op.id, op.body);
      return;
    case "task.delete":
      await deleteTask(op.id);
      return;
  }
};

/**
 * Sends one operation and records it in the snapshot.
 *
 * Rethrows on a network error or a 5xx, which aborts the flush; everything else
 * is healed or dropped, because the snapshot can legitimately be stale (another
 * tab, a logout that resets to `defaultUser`) and one unprocessable operation
 * must never wedge the queue.
 */
const applyOp = async (snapshot: SyncSnapshot, op: SyncOp): Promise<void> => {
  try {
    await send(op);
  } catch (error) {
    if (!(error instanceof TodoApiError)) throw error;

    if (error.status === 409 && isCreate(op)) {
      await send(asUpdate(op)); // it already exists — patch it instead
    } else if (error.status === 404 && isUpdate(op)) {
      await send(asCreate(op)); // it is not there — post it instead
    } else if (error.status === 404 && isDelete(op)) {
      // Already gone: the desired state is reached.
    } else if (error.isPermanent) {
      console.warn("[todoSync] dropping unprocessable operation", op, error);
    } else {
      throw error;
    }
  }

  advanceSnapshot(snapshot, op);
};

/**
 * Keeps the optional backend in step with the locally-owned `User` state.
 *
 * `localStorage` stays the source of truth for the UI; this hook observes the
 * *committed* `tasks` / `categories` and mirrors them to the server in the
 * background. It never wraps `setUser` — diffing inside a state updater is a
 * side effect in a reducer and double-fires under StrictMode — so no `setUser`
 * call site outside `UserProvider` is affected.
 *
 * Failures are expected, not exceptional: the app is deployed as static assets
 * with no backend at all. Nothing here surfaces in the UI.
 */
export function useTodoSync(user: User, setUser: React.Dispatch<React.SetStateAction<User>>): void {
  const isOnline = useOnlineStatus();

  /** What we believe the server holds. `null` until the first successful pull. */
  const snapshotRef = useRef<SyncSnapshot | null>(null);
  /** Bumped on every snapshot refresh, so the diff effect re-runs after a pull. */
  const [snapshotVersion, setSnapshotVersion] = useState(0);

  const reconcilingRef = useRef(false);
  const flushingRef = useRef(false);
  /** A mutation was committed while a flush was in flight — re-derive at the end. */
  const pendingFlushRef = useRef(false);
  const failureCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconcileRef = useRef<() => void>(() => {});

  /**
   * The latest committed user, read without becoming a dependency. In
   * particular `deletedTasks` is mutated in place elsewhere, so it must never
   * be watched — only read.
   */
  const userRef = useRef(user);
  useEffect(() => {
    userRef.current = user;
  });

  const clearRetry = useCallback(() => {
    if (retryTimerRef.current !== null) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  const scheduleRetry = useCallback(() => {
    if (retryTimerRef.current !== null) return;
    const delay = RETRY_DELAYS_MS[Math.min(failureCountRef.current, RETRY_DELAYS_MS.length - 1)];
    failureCountRef.current += 1;
    retryTimerRef.current = setTimeout(() => {
      retryTimerRef.current = null;
      reconcileRef.current();
    }, delay);
  }, []);

  /** Pull the server's view, merge it in, and re-arm the snapshot. */
  const reconcile = useCallback(async () => {
    if (!isOnline || reconcilingRef.current) return;
    reconcilingRef.current = true;
    clearRetry();

    try {
      const [serverTasks, serverCategories] = await Promise.all([fetchTasks(), fetchCategories()]);

      // Merging before refreshing the snapshot is essential: an entity another
      // client added would otherwise be "in the snapshot, absent locally" and
      // the next diff would delete it.
      const merged = mergeFromServer(userRef.current, {
        tasks: serverTasks,
        categories: serverCategories,
      });
      if (merged.changed) {
        setUser((prevUser) => ({
          ...prevUser,
          tasks: merged.tasks,
          categories: merged.categories,
        }));
      }

      snapshotRef.current = snapshotFromServer(serverTasks, serverCategories);
      failureCountRef.current = 0;
      setSnapshotVersion((version) => version + 1);
    } catch (error) {
      console.debug("[todoSync] reconcile failed, staying local-only", error);
      scheduleRetry();
    } finally {
      reconcilingRef.current = false;
    }
  }, [isOnline, setUser, clearRetry, scheduleRetry]);

  /** Derive the pending operations from the snapshot and send them in order. */
  const flush = useCallback(async () => {
    if (!isOnline || snapshotRef.current === null) return;
    if (flushingRef.current) {
      // A flush is already running. Recording the request rather than dropping
      // it is what makes mutations committed mid-flush coalesce: the running
      // flush re-derives once more before it returns, instead of the change
      // waiting for the next mutation, reload or reconnect.
      pendingFlushRef.current = true;
      return;
    }
    flushingRef.current = true;

    try {
      do {
        pendingFlushRef.current = false;
        // Re-read both sides on every pass: a mutation or a reconcile may have
        // landed while the previous pass was awaiting the network, so anything
        // captured by the effect run that started this flush is already stale.
        const snapshot = snapshotRef.current;
        if (snapshot === null) break;
        const { tasks, categories } = userRef.current;

        for (const op of diffAgainstSnapshot(snapshot, tasks, categories)) {
          await applyOp(snapshot, op);
        }
      } while (pendingFlushRef.current);
    } catch (error) {
      // Aborting mid-list is safe: the operation list is derived, so the next
      // flush recomputes exactly the work that is left. Nothing else would
      // trigger that next flush though — a backend that dies mid-session fires
      // no `online` event — so arm the backoff, whose reconcile bumps
      // `snapshotVersion` and thereby re-runs the push effect.
      console.debug("[todoSync] flush interrupted, retry scheduled", error);
      scheduleRetry();
    } finally {
      pendingFlushRef.current = false;
      flushingRef.current = false;
    }
  }, [isOnline, scheduleRetry]);

  useEffect(() => {
    reconcileRef.current = () => void reconcile();
  }, [reconcile]);

  // Hydrate on mount, and pull again whenever the connection comes back.
  useEffect(() => {
    void reconcile();
  }, [reconcile]);

  useEffect(() => clearRetry, [clearRetry]);

  // Push on every committed mutation. Idempotent under StrictMode: the second
  // run diffs against the snapshot the first one already advanced.
  useEffect(() => {
    // `snapshotVersion` is 0 until the first successful pull; with no snapshot
    // there is nothing to diff against and nothing may be pushed.
    if (snapshotVersion === 0) return;
    void flush();
    // `user.tasks` / `user.categories` are the trigger, not an input: `flush`
    // re-reads the latest committed state itself, so a mutation that lands
    // while a flush is in flight is coalesced instead of lost.
  }, [flush, snapshotVersion, user.tasks, user.categories]);
}
