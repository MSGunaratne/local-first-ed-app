import { isRedirect } from "@tanstack/react-router";

import { type AppError, normalizeError } from "./errors";

export type Result<T> =
	| { success: true; data: T; error?: never }
	| { success: false; data?: never; error: AppError };

// Overload for void/undefined data
export function success(): Result<void>;
// Overload for actual data
export function success<T>(data: T): Result<T>;
// Implementation
export function success<T>(data?: T): Result<T | void> {
	return { success: true, data: data as T };
}

export function failure(error: AppError): Result<never> {
	return { success: false, error };
}

/**
 * Wraps an async function to catch errors and return a structured Result.
 */
export async function safeAction<T>(
	action: () => Promise<T>,
): Promise<Result<T>> {
	try {
		const data = await action();
		return success(data);
	} catch (error) {
		if (isRedirect(error)) {
			throw error;
		}

		const appError = normalizeError(error);
		return failure(appError);
	}
}

export async function unwrapResult<T>(promise: Promise<Result<T>>): Promise<T> {
	const result = await promise;
	// If result is undefined/null, it means the action redirected
	if (!result) {
		return undefined as T;
	}
	if (!result.success) {
		throw result.error;
	}
	return result.data;
}
