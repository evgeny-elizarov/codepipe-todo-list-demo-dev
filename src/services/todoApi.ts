import type { Category, Task, UUID } from "../types/user";

/**
 * Typed HTTP client for the optional todo backend (see `server/README.md`).
 *
 * Nothing here ever shows a toast: the backend being absent is the normal
 * deployed state (Netlify publishes static assets only), so an unreachable API
 * must stay invisible to the user. Callers decide what to log.
 */

/** Trailing slashes would produce `//api//tasks`. */
const API_BASE = (import.meta.env.VITE_API_URL ?? "/api").replace(/\/+$/, "");

const REQUEST_TIMEOUT_MS = 8000;

/** A response was received, but it was not a success. */
export class TodoApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "TodoApiError";
    this.status = status;
  }

  /** 4xx — the request itself is wrong, so retrying it unchanged will not help. */
  get isPermanent(): boolean {
    return this.status >= 400 && this.status < 500;
  }
}

// ---------------------------------------------------------------------------
// Wire types
// ---------------------------------------------------------------------------

/** A category exactly as the server sends it: dates are ISO strings, optionals are null. */
export interface CategoryDto {
  id: UUID;
  name: string;
  emoji: string | null;
  color: string;
  lastSave: string | null;
}

/** A task exactly as the server sends it. */
export interface TaskDto {
  id: UUID;
  done: boolean;
  pinned: boolean;
  name: string;
  description: string | null;
  emoji: string | null;
  color: string;
  date: string;
  deadline: string | null;
  lastSave: string | null;
  position: number | null;
  category: CategoryDto[];
}

/** A category as the client sends it. `id` is omitted on PATCH. */
export interface CategoryPayload {
  id: UUID;
  name: string;
  emoji: string | null;
  color: string;
  lastSave: string | null;
}

/** A task as the client sends it. `category` is a list of id references. */
export interface TaskPayload {
  id: UUID;
  done: boolean;
  pinned: boolean;
  name: string;
  description: string | null;
  emoji: string | null;
  color: string;
  date: string;
  deadline: string | null;
  lastSave: string | null;
  position: number | null;
  category: { id: UUID }[];
}

// ---------------------------------------------------------------------------
// Conversions
// ---------------------------------------------------------------------------

/**
 * Serialises a date field for the wire.
 *
 * Accepts `string` as well as `Date` on purpose: `useStorageState` round-trips
 * the user object through JSON, so after any reload `task.date` is an ISO
 * string at runtime despite being typed `Date`.
 */
export const toIso = (value: Date | string | undefined | null): string | null => {
  if (value === undefined || value === null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return isNaN(date.getTime()) ? null : date.toISOString();
};

/** `null` (wire) becomes `undefined` (domain) — `Task`'s optionals are `?: T`, not `T | null`. */
const orUndefined = <T>(value: T | null): T | undefined => value ?? undefined;

const toDate = (value: string | null): Date | undefined =>
  value === null ? undefined : new Date(value);

export const toCategory = (dto: CategoryDto): Category => ({
  id: dto.id,
  name: dto.name,
  emoji: orUndefined(dto.emoji),
  color: dto.color,
  lastSave: toDate(dto.lastSave),
});

export const toTask = (dto: TaskDto): Task => ({
  id: dto.id,
  done: dto.done,
  pinned: dto.pinned,
  name: dto.name,
  description: orUndefined(dto.description),
  emoji: orUndefined(dto.emoji),
  color: dto.color,
  date: new Date(dto.date),
  deadline: toDate(dto.deadline),
  category: dto.category.map(toCategory),
  lastSave: toDate(dto.lastSave),
  position: orUndefined(dto.position),
});

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    // A network failure throws before this point and propagates as-is, which is
    // how callers tell "server said no" from "no server".
    throw new TodoApiError(
      response.status,
      `${init?.method ?? "GET"} ${path} → ${response.status}`,
    );
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const fetchTasks = async (): Promise<Task[]> =>
  (await request<TaskDto[]>("/tasks")).map(toTask);

export const createTask = async (payload: TaskPayload): Promise<Task> =>
  toTask(await request<TaskDto>("/tasks", { method: "POST", body: JSON.stringify(payload) }));

export const updateTask = async (id: UUID, payload: TaskPayload): Promise<Task> =>
  toTask(
    await request<TaskDto>(`/tasks/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  );

export const deleteTask = (id: UUID): Promise<void> =>
  request<void>(`/tasks/${id}`, { method: "DELETE" });

export const fetchCategories = async (): Promise<Category[]> =>
  (await request<CategoryDto[]>("/categories")).map(toCategory);

export const createCategory = async (payload: CategoryPayload): Promise<Category> =>
  toCategory(
    await request<CategoryDto>("/categories", { method: "POST", body: JSON.stringify(payload) }),
  );

export const updateCategory = async (id: UUID, payload: CategoryPayload): Promise<Category> =>
  toCategory(
    await request<CategoryDto>(`/categories/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  );

export const deleteCategory = (id: UUID): Promise<void> =>
  request<void>(`/categories/${id}`, { method: "DELETE" });
