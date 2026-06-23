// ----------------------------------------------------------------------
// Local SQLite database initialization via wa-sqlite + IDBBatchAtomicVFS
// Provides a persistent, offline-capable SQLite database in the browser
// using IndexedDB as the storage backend.
// ----------------------------------------------------------------------

import type { SQLiteAPI, SQLiteBindValue, SQLiteVFS } from "wa-sqlite";
import * as SQLite from "wa-sqlite";
import { IDBBatchAtomicVFS } from "wa-sqlite/src/examples/IDBBatchAtomicVFS.js";
import { migrateSchema } from "./schema";

const DB_NAME = "local-ed-app-db";

type SQLParams = readonly SQLiteBindValue[];

type RowCallback = (
	row: readonly unknown[],
	columns: readonly string[],
) => void;

let sqlite3: SQLiteAPI | null = null;
let db: number | null = null;
let vfs: SQLiteVFS | null = null;
let wasmModule: unknown = null;
let initPromise: Promise<void> | null = null;

// Global file mapping to survive VFS instance replacements if they ever happen.
const GLOBAL_VFS_FILE_MAP = new Map<number, unknown>();

// Serial queue to ensure only one SQLite operation happens at a time.
let dbQueue: Promise<unknown> = Promise.resolve();

function getReadyState() {
	if (!sqlite3 || db === null) {
		throw new Error("[LocalDB] Not initialized. Call initLocalDb() first.");
	}

	return {
		sqlite3,
		db,
	};
}

/**
 * Cleanly close the local database.
 */
export async function closeLocalDb(): Promise<void> {
	if (db !== null && sqlite3 !== null) {
		try {
			await sqlite3.close(db);
		} catch {
			// Ignore close failures during teardown
		}
	}
	db = null;
}

/**
 * Completely delete the local SQLite database from IndexedDB.
 */
export async function deleteLocalDb(): Promise<void> {
	await closeLocalDb();

	// Reset module-level state to allow clean re-initialization
	vfs = null;
	sqlite3 = null;
	wasmModule = null;
	initPromise = null;
	GLOBAL_VFS_FILE_MAP.clear();
	dbQueue = Promise.resolve();

	if (typeof window !== "undefined" && window.indexedDB) {
		return new Promise<void>((resolve, reject) => {
			const req = window.indexedDB.deleteDatabase(DB_NAME);
			req.onsuccess = () => {
				console.info(
					"[LocalDB] SQLite IndexedDB database deleted successfully",
				);
				resolve();
			};
			req.onerror = (err) => {
				console.error(
					"[LocalDB] Failed to delete SQLite IndexedDB database",
					err,
				);
				reject(err);
			};
			req.onblocked = () => {
				console.warn(
					"[LocalDB] Deletion blocked. Some connections might still be open.",
				);
				resolve(); // Resolve anyway so we don't block downstream code indefinitely
			};
		});
	}
}

/**
 * Initialize the local SQLite database.
 * Safe to call multiple times — returns the same promise.
 */
export async function initLocalDb(): Promise<void> {
	if (db !== null && sqlite3 !== null) {
		return;
	}
	if (initPromise) {
		return initPromise;
	}

	initPromise = (async () => {
		try {
			if (!wasmModule) {
				const { default: SQLiteAsyncESMFactory } = await import(
					"wa-sqlite/dist/wa-sqlite-async.mjs"
				);
				wasmModule = await SQLiteAsyncESMFactory();
				sqlite3 = SQLite.Factory(wasmModule);
			}

			if (!vfs) {
				const createdVfs = new IDBBatchAtomicVFS(DB_NAME, wasmModule);
				await createdVfs.isReady();
				vfs = createdVfs;
				const activeVfs = vfs;
				activeVfs.mapIdToFile = GLOBAL_VFS_FILE_MAP;

				const wrapSafe = (methodName: string, errorCode: number) => {
					const method = activeVfs[methodName];
					if (typeof method !== "function") {
						return;
					}

					const original = method.bind(activeVfs) as (
						...args: readonly unknown[]
					) => Promise<number> | number;

					activeVfs[methodName] = async (...args: readonly unknown[]) => {
						const fileId = args[0];
						if (
							typeof fileId === "number" &&
							!GLOBAL_VFS_FILE_MAP.has(fileId)
						) {
							console.warn(
								`[VFS] Prevented crash: stale fileId ${fileId} in ${methodName}`,
							);
							return errorCode;
						}

						const result = original(...args);
						if (result instanceof Promise) {
							return result;
						}
						return result;
					};
				};

				wrapSafe("jRead", SQLite.SQLITE_IOERR_READ || 1);
				wrapSafe("jWrite", SQLite.SQLITE_IOERR_WRITE || 1);
				wrapSafe("jTruncate", SQLite.SQLITE_IOERR_TRUNCATE || 1);
				wrapSafe("jSync", SQLite.SQLITE_IOERR_FSYNC || 1);
				wrapSafe("jFileSize", SQLite.SQLITE_IOERR_FSTAT || 1);
				wrapSafe("jClose", SQLite.SQLITE_OK || 0);

				if (!sqlite3) {
					throw new Error("[LocalDB] SQLite API unavailable during VFS setup.");
				}
				sqlite3.vfs_register(activeVfs, true);
			}

			if (!sqlite3) {
				throw new Error("[LocalDB] SQLite API unavailable during DB open.");
			}

			if (db === null) {
				db = await sqlite3.open_v2(`/${DB_NAME}`);
				await sqlite3.exec(db, "PRAGMA foreign_keys=ON;");
				await sqlite3.exec(db, "PRAGMA journal_mode=WAL;");
			}

			await migrateSchema(sqlite3, db);
			console.info("[LocalDB] Initialized successfully");
		} catch (error) {
			db = null;
			initPromise = null;
			throw error;
		}
	})();

	return initPromise;
}

/**
 * Get the initialized SQLite API instance.
 */
export function getSqlite3(): SQLiteAPI {
	return getReadyState().sqlite3;
}

/**
 * Get the opened database pointer.
 */
export function getDb(): number {
	return getReadyState().db;
}

/**
 * Helper to run an operation through the serial queue.
 */
async function enqueue<T>(op: () => Promise<T>): Promise<T> {
	const next = dbQueue.then(op);
	dbQueue = next.catch(() => {});
	return next;
}

/**
 * Internal helper to execute SQL without enqueuing.
 */
async function _internalExecWithParams(
	s: SQLiteAPI,
	d: number,
	sql: string,
	params?: SQLParams,
	callback?: RowCallback,
): Promise<void> {
	for await (const stmt of s.statements(d, sql)) {
		if (params) {
			s.bind_collection(stmt, params);
		}

		let columns: readonly string[] | null = null;
		while ((await s.step(stmt)) === SQLite.SQLITE_ROW) {
			if (!callback) {
				continue;
			}

			if (!columns) {
				columns = s.column_names(stmt);
			}
			const row = s.row(stmt);
			callback(row, columns);
		}
	}
}

/**
 * Internal helper for queries without enqueuing.
 */
async function _internalQuery<T extends Record<string, unknown>>(
	s: SQLiteAPI,
	d: number,
	sql: string,
	params?: SQLParams,
): Promise<T[]> {
	const results: T[] = [];
	await _internalExecWithParams(s, d, sql, params, (row, columns) => {
		const obj: Record<string, unknown> = {};
		for (let i = 0; i < columns.length; i++) {
			obj[columns[i]] = row[i];
		}
		results.push(obj as T);
	});
	return results;
}

/**
 * Execute SQL with parameters, serialized via dbQueue.
 */
export async function execWithParams(
	s: SQLiteAPI,
	d: number,
	sql: string,
	params?: SQLParams,
	callback?: RowCallback,
): Promise<void> {
	return enqueue(() => _internalExecWithParams(s, d, sql, params, callback));
}

/**
 * Execute a read query and return typed results.
 */
export async function query<T extends Record<string, unknown>>(
	sql: string,
	params?: SQLParams,
): Promise<T[]> {
	await initLocalDb();
	const state = getReadyState();
	return enqueue(() => _internalQuery<T>(state.sqlite3, state.db, sql, params));
}

/**
 * Execute a write statement (INSERT, UPDATE, DELETE).
 */
export async function execute(
	sql: string,
	params?: SQLParams,
): Promise<number> {
	await initLocalDb();
	const state = getReadyState();
	return enqueue(async () => {
		await _internalExecWithParams(state.sqlite3, state.db, sql, params);
		return state.sqlite3.changes(state.db);
	});
}

/**
 * Execute multiple statements in a transaction.
 */
export async function transaction(
	fn: (
		exec: (sql: string, params?: SQLParams) => Promise<void>,
		qry: <T extends Record<string, unknown>>(
			sql: string,
			params?: SQLParams,
		) => Promise<T[]>,
	) => Promise<void>,
): Promise<void> {
	await initLocalDb();
	const state = getReadyState();

	await enqueue(async () => {
		await state.sqlite3.exec(state.db, "BEGIN TRANSACTION;");
		try {
			const internalExec = async (sql: string, params?: SQLParams) => {
				await _internalExecWithParams(state.sqlite3, state.db, sql, params);
			};

			const internalQry = async <T extends Record<string, unknown>>(
				sql: string,
				params?: SQLParams,
			) => _internalQuery<T>(state.sqlite3, state.db, sql, params);

			await fn(internalExec, internalQry);
			await state.sqlite3.exec(state.db, "COMMIT;");
		} catch (error) {
			await state.sqlite3.exec(state.db, "ROLLBACK;");
			throw error;
		}
	});
}

/**
 * Check if the local database is available and initialized.
 */
export function isReady(): boolean {
	return db !== null && sqlite3 !== null;
}

declare global {
	interface Window {
		__DEBUG_LOCAL_DB?: {
			query: typeof query;
			execute: typeof execute;
			isReady: typeof isReady;
			getStats: () => Promise<{
				initialized: boolean;
				dbName: string;
				tables: Record<string, number>;
				sqliteVersion: string;
			}>;
		};
	}
}

if (typeof window !== "undefined") {
	window.__DEBUG_LOCAL_DB = {
		query,
		execute,
		isReady,
		getStats: async () => {
			const state = getReadyState();
			const tables = await query<{ name: string }>(
				"SELECT name FROM sqlite_master WHERE type='table';",
			);
			const counts: Record<string, number> = {};
			for (const table of tables) {
				const res = await query<{ count: number }>(
					`SELECT count(*) as count FROM ${table.name}`,
				);
				counts[table.name] = res[0]?.count ?? 0;
			}
			return {
				initialized: isReady(),
				dbName: DB_NAME,
				tables: counts,
				sqliteVersion: state.sqlite3.libversion(),
			};
		},
	};
}
