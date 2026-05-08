// Job tracking simple en SQLite. Permite lanzar scrapes desde la app
// y consultar el estado vía polling. No hay queue real — los jobs corren
// en paralelo dentro del proceso Node de Next.js.

import { randomUUID } from "node:crypto";
import { getDb } from "./db";

export type JobType = "profile" | "hashtag";
export type JobStatus = "running" | "done" | "failed";

export interface Job {
  id: string;
  type: JobType;
  input: any;
  status: JobStatus;
  message: string | null;
  result: any | null;
  error: string | null;
  startedAt: number;
  finishedAt: number | null;
}

export function createJob(type: JobType, input: any, message?: string): string {
  const db = getDb();
  const id = randomUUID();
  db.prepare(
    `INSERT INTO jobs (id, type, input, status, message, started_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    type,
    JSON.stringify(input),
    "running",
    message ?? null,
    Math.floor(Date.now() / 1000)
  );
  return id;
}

export function updateJobMessage(id: string, message: string): void {
  const db = getDb();
  db.prepare("UPDATE jobs SET message = ? WHERE id = ?").run(message, id);
}

export function finishJob(
  id: string,
  status: "done" | "failed",
  payload: { result?: any; error?: string; message?: string } = {}
): void {
  const db = getDb();
  db.prepare(
    `UPDATE jobs SET
       status      = ?,
       result      = ?,
       error       = ?,
       message     = COALESCE(?, message),
       finished_at = ?
     WHERE id = ?`
  ).run(
    status,
    payload.result != null ? JSON.stringify(payload.result) : null,
    payload.error ?? null,
    payload.message ?? null,
    Math.floor(Date.now() / 1000),
    id
  );
}

export function getJob(id: string): Job | null {
  const db = getDb();
  const r = db.prepare("SELECT * FROM jobs WHERE id = ?").get(id) as any;
  if (!r) return null;
  return rowToJob(r);
}

export function listRecentJobs(limit = 10): Job[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM jobs ORDER BY started_at DESC LIMIT ?")
    .all(limit) as any[];
  return rows.map(rowToJob);
}

function rowToJob(r: any): Job {
  return {
    id: r.id,
    type: r.type,
    input: tryJson(r.input),
    status: r.status,
    message: r.message,
    result: tryJson(r.result),
    error: r.error,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
  };
}

function tryJson(s: string | null): any {
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}
