declare module "wa-sqlite" {
	export type SQLiteBindValue = string | number | Uint8Array | null | undefined;

	export interface SQLiteStatementHandle {
		readonly __brand?: "SQLiteStatementHandle";
	}

	export interface SQLiteVFS {
		name: string;
		mapIdToFile?: Map<number, unknown>;
		close(): Promise<void>;
		isReady(): Promise<void>;
		[key: string]: unknown;
	}

	export interface SQLiteAPI {
		open_v2(path: string): Promise<number>;
		close(db: number): Promise<void>;
		exec(db: number, sql: string): Promise<void>;
		statements(db: number, sql: string): AsyncIterable<SQLiteStatementHandle>;
		bind_collection(
			stmt: SQLiteStatementHandle,
			params: readonly SQLiteBindValue[],
		): void;
		step(stmt: SQLiteStatementHandle): Promise<number>;
		column_names(stmt: SQLiteStatementHandle): string[];
		row(stmt: SQLiteStatementHandle): unknown[];
		changes(db: number): number;
		libversion(): string;
		vfs_register(vfs: SQLiteVFS, makeDefault?: boolean): number;
	}

	export function Factory(module: unknown): SQLiteAPI;
	export const SQLITE_OK = 0;
	export const SQLITE_ROW = 100;
	export const SQLITE_DONE = 101;
	export const SQLITE_IOERR_READ: number;
	export const SQLITE_IOERR_WRITE: number;
	export const SQLITE_IOERR_TRUNCATE: number;
	export const SQLITE_IOERR_FSYNC: number;
	export const SQLITE_IOERR_FSTAT: number;
	export const SQLITE_OPEN_READWRITE = 0x00000002;
	export const SQLITE_OPEN_CREATE = 0x00000004;
	export const SQLITE_OPEN_MAIN_DB = 0x00000001;
	export const SQLITE_OPEN_TEMP_DB = 0x00000002;
	export const SQLITE_OPEN_TRANSIENT_DB = 0x00000004;
	export const SQLITE_OPEN_MAIN_JOURNAL = 0x00000800;
	export const SQLITE_OPEN_TEMP_JOURNAL = 0x00001000;
	export const SQLITE_OPEN_SUBJOURNAL = 0x00002000;
	export const SQLITE_OPEN_MASTER_JOURNAL = 0x00004000;
	export const SQLITE_OPEN_NOMUTEX = 0x00008000;
	export const SQLITE_OPEN_FULLMUTEX = 0x00010000;
	export const SQLITE_OPEN_SHAREDCACHE = 0x00020000;
	export const SQLITE_OPEN_PRIVATECACHE = 0x00040000;
	export const SQLITE_OPEN_WAL = 0x00080000;
	export const SQLITE_OPEN_MEMORY = 0x00000080;
}

declare module "wa-sqlite/src/examples/OPFSAdaptiveVFS.js" {
	export class OPFSAdaptiveVFS {
		static create(
			name: string,
			module: unknown,
			options?: {
				log?: (...args: readonly unknown[]) => void;
			},
		): Promise<OPFSAdaptiveVFS>;
		name: string;
		close(): Promise<void>;
		isReady(): Promise<void>;
	}
}

declare module "wa-sqlite/src/examples/IDBBatchAtomicVFS.js" {
	export class IDBBatchAtomicVFS {
		name: string;
		mapIdToFile?: Map<number, unknown>;
		constructor(
			idbDatabaseName?: string,
			options?:
				| {
						durability?: "default" | "strict" | "relaxed";
						purge?: "deferred" | "manual";
						purgeAtLeast?: number;
				  }
				| unknown,
		);
		close(): Promise<void>;
		isReady(): Promise<void>;
		[key: string]: unknown;
	}
}

declare module "wa-sqlite/dist/wa-sqlite-async.mjs" {
	const factory: () => Promise<unknown>;
	export default factory;
}
