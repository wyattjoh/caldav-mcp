import { Database } from "bun:sqlite";
import { applyMigrations } from "./migrations";

export const createDb = (path: string): Database => {
  const db = new Database(path);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  applyMigrations(db);
  return db;
};

let singleton: Database | undefined;
export const getDb = (path: string): Database => {
  if (!singleton) singleton = createDb(path);
  return singleton;
};
