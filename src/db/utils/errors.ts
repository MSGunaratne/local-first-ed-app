import { APIError } from "better-auth";
import { prettifyError, ZodError } from "zod";

// ----------------------------------------------------------------------
// SQLite error codes
// ----------------------------------------------------------------------

const SQLITE_ERROR_CODES = {
	UNIQUE_VIOLATION: "SQLITE_CONSTRAINT_UNIQUE",
	FOREIGN_KEY_VIOLATION: "SQLITE_CONSTRAINT_FOREIGNKEY",
	NOT_NULL_VIOLATION: "SQLITE_CONSTRAINT_NOTNULL",
	CHECK_VIOLATION: "SQLITE_CONSTRAINT_CHECK",
} as const;

type SqliteError = {
	code: string;
	message: string;
};

// ----------------------------------------------------------------------
// Structured error types
// ----------------------------------------------------------------------

type AppErrorCode =
	| "VALIDATION_ERROR"
	| "NOT_FOUND"
	| "CONFLICT"
	| "UNIQUE_CONSTRAINT_VIOLATION"
	| "FOREIGN_KEY_VIOLATION"
	| "NOT_NULL_VIOLATION"
	| "CHECK_VIOLATION"
	| "STRING_TOO_LONG"
	| "UNAUTHENTICATED"
	| "UNAUTHORIZED"
	| "DATABASE_ERROR"
	| "INTERNAL_SERVER_ERROR"
	| "UNKNOWN_ERROR";

export interface AppError {
	status: number;
	code: AppErrorCode | (string & {});
	message: string;
	field?: string | null;
	details?: string;
}

// ----------------------------------------------------------------------
// Custom error classes
// ----------------------------------------------------------------------

export class DatabaseConflictError extends Error implements AppError {
	public status = 409;
	public code = "UNIQUE_CONSTRAINT_VIOLATION";

	constructor(
		message: string,
		public field: string | null = null,
		public details?: string,
	) {
		super(message);
		this.name = "DatabaseConflictError";
	}
}

export class ValidationError extends Error implements AppError {
	public status = 400;
	public code;

	constructor(
		message: string,
		code: AppErrorCode = "VALIDATION_ERROR",
		public field: string | null = null,
		public details?: string,
	) {
		super(message);
		this.name = "ValidationError";
		this.code = code;
	}
}

export class NotFoundError extends Error implements AppError {
	public status = 404;
	public code = "NOT_FOUND";
	public field: string | null = null;
	public details?: string;

	constructor(resource: string, id?: string) {
		super(id ? `${resource} with ID ${id} not found` : `${resource} not found`);
		this.name = "NotFoundError";
	}
}

export class AuthenticationError extends Error implements AppError {
	public status = 401;
	public code = "UNAUTHENTICATED";
	public field: string | null = null;
	public details?: string;

	constructor(message: string = "Authentication required") {
		super(message);
		this.name = "AuthenticationError";
	}
}

export class AuthorizationError extends Error implements AppError {
	public status = 403;
	public code = "UNAUTHORIZED";
	public field: string | null = null;
	public details?: string;

	constructor(
		message: string = "You do not have permission to perform this action",
	) {
		super(message);
		this.name = "AuthorizationError";
	}
}

export class ServerError extends Error implements AppError {
	public status = 500;
	public code = "INTERNAL_SERVER_ERROR";
	public field: string | null = null;
	public details?: string;

	constructor(
		message: string = "An unexpected error occurred",
		options?: { cause?: unknown },
	) {
		super(message, options);
		this.name = "ServerError";
	}
}

export class ConflictError extends Error implements AppError {
	public status = 409;
	public code = "CONFLICT";
	public field: string | null = null;
	public details?: string;

	constructor(
		message: string = "This record was modified by another user",
		public serverRecord?: unknown,
	) {
		super(message);
		this.name = "ConflictError";
	}
}

export class DialogSmsError extends Error implements AppError {
	public status = 502;
	public code = "DIALOG_SMS_ERROR";
	public field: string | null = null;
	public details?: string;

	constructor(message: string, options?: { cause?: unknown }) {
		super(`Dialog SMS: ${message}`, options);
		this.name = "DialogSmsError";
	}
}

// ----------------------------------------------------------------------
// Type Guards & Helpers
// ----------------------------------------------------------------------

function isSqliteError(error: unknown): error is SqliteError {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		typeof error.code === "string"
	);
}

function isAppError(error: unknown): error is AppError {
	return (
		typeof error === "object" &&
		error !== null &&
		"status" in error &&
		"code" in error &&
		"message" in error
	);
}

// ----------------------------------------------------------------------
// Parser helpers
// ----------------------------------------------------------------------

function parseUniqueViolation(sqliteError: SqliteError) {
	const message = sqliteError.message;

	// Regex for standard unique constraint: "UNIQUE constraint failed: table.column"
	const match = message.match(/UNIQUE constraint failed: (?:[^.]+\.)?([^,]+)/);

	if (match) {
		const field = match[1];

		// Convert snake_case to Title Case
		const fieldName = field
			.split("_")
			.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
			.join(" ");

		return new DatabaseConflictError(
			`${fieldName} is already in use`,
			field,
			sqliteError.code,
		);
	}

	return new DatabaseConflictError(
		"A record with this information already exists",
		null,
		sqliteError.code,
	);
}

function parseForeignKeyViolation(sqliteError: SqliteError) {
	// SQLite message usually: "FOREIGN KEY constraint failed"
	// Unlike Postgres, it doesn't give us the specific field in the message easily
	// without extended result codes enabled/configured or parsing more generic text.

	return new ValidationError(
		"Invalid reference to related record",
		"FOREIGN_KEY_VIOLATION",
		null,
		sqliteError.message,
	);
}

function parseNotNullViolation(sqliteError: SqliteError) {
	const message = sqliteError.message;

	const match = message.match(
		/NOT NULL constraint failed: (?:[^.]+\.)?([^,]+)/,
	);

	if (match) {
		const field = match[1];
		const fieldName = field
			.split("_")
			.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
			.join(" ");

		return new ValidationError(
			`${fieldName} is required`,
			"NOT_NULL_VIOLATION",
			field,
		);
	}

	return new ValidationError("Required field missing", "NOT_NULL_VIOLATION");
}

// ----------------------------------------------------------------------
// Main error handler
// ----------------------------------------------------------------------

function handleDatabaseError(error: unknown): never {
	// If it's already an AppError, rethrow
	if (isAppError(error)) {
		throw error;
	}

	// Not a database error - rethrow as-is
	if (!(error instanceof Error)) {
		throw error;
	}

	// Extract SQLite error
	// NeonDbError usually comes as `cause` or directly if using some drivers
	const sqliteError = isSqliteError(error)
		? error
		: (error.cause as SqliteError | undefined);

	// If we can't identify it as a SQLite error, generic rethrow
	if (!sqliteError || typeof sqliteError.code !== "string") {
		// Fallback for non-sqlite errors or if identification failed
		throw error;
	}

	const code = sqliteError.code;

	// Parse based on error code
	switch (code) {
		case SQLITE_ERROR_CODES.UNIQUE_VIOLATION:
			throw parseUniqueViolation(sqliteError);

		case SQLITE_ERROR_CODES.FOREIGN_KEY_VIOLATION:
			throw parseForeignKeyViolation(sqliteError);

		case SQLITE_ERROR_CODES.NOT_NULL_VIOLATION:
			throw parseNotNullViolation(sqliteError);

		case SQLITE_ERROR_CODES.CHECK_VIOLATION:
			throw new ValidationError(
				`Data validation failed: ${sqliteError.message}`,
				"CHECK_VIOLATION",
				null,
			);

		default:
			// Unknown database error
			throw new ServerError(`Database error: ${error.message}`, {
				cause: error,
			});
	}
}

// ----------------------------------------------------------------------
// Normalization
// ----------------------------------------------------------------------

export function normalizeError(error: unknown) {
	// 1. Handle Zod Errors with Zod v4 prettifyError
	if (error instanceof ZodError) {
		return {
			status: 400,
			code: "VALIDATION_ERROR",
			message: "Validation failed",
			details: prettifyError(error),
		};
	}

	// 2. Handle Better Call APIError (Better Auth)
	if (error instanceof APIError) {
		const status = typeof error.status === "number" ? error.status : 500;
		return {
			status,
			code: error.body?.code ?? "API_ERROR",
			message: error.body?.message ?? error.message,
			details: JSON.stringify(error.cause),
		};
	}

	// 3. Handle AppError instances (including our custom classes)
	if (isAppError(error)) {
		return {
			status: error.status,
			code: error.code,
			message: error.message,
			field: error.field,
			details: error.details,
		};
	}

	// 4. Try to handle as Database Error
	try {
		handleDatabaseError(error);
	} catch (dbError) {
		if (isAppError(dbError)) {
			return {
				status: dbError.status,
				code: dbError.code,
				message: dbError.message,
				field: dbError.field,
				details: dbError.details,
			};
		}
	}

	// 4. Handle generic Error
	if (error instanceof Error) {
		return {
			status: 500,
			code: "INTERNAL_SERVER_ERROR",
			message: error.message,
		};
	}

	// 5. Fallback
	return {
		status: 500,
		code: "UNKNOWN_ERROR",
		message: "An unexpected error occurred",
	};
}
