import { NextResponse } from "next/server";
import type { ApiResponse, PaginatedResponse, PaginationMeta } from "@/types";

/**
 * Create a success API response.
 */
export function successResponse<T>(
  data: T,
  meta?: Record<string, unknown>,
  status = 200
): NextResponse<ApiResponse<T>> {
  return NextResponse.json(
    {
      success: true,
      data,
      ...(meta ? { meta } : {}),
    },
    { status }
  );
}

/**
 * Create an error API response.
 */
export function errorResponse(
  error: string,
  status = 400,
  meta?: Record<string, unknown>
): NextResponse<ApiResponse<never>> {
  return NextResponse.json(
    {
      success: false,
      error,
      ...(meta ? { meta } : {}),
    },
    { status }
  );
}

/**
 * Create a paginated API response.
 */
export function paginatedResponse<T>(
  data: T[],
  pagination: PaginationMeta,
  meta?: Record<string, unknown>
): NextResponse<PaginatedResponse<T>> {
  return NextResponse.json(
    {
      success: true,
      data,
      pagination,
      ...(meta ? { meta } : {}),
    },
    { status: 200 }
  );
}

/**
 * Build pagination metadata from total count and current page/perPage.
 */
export function buildPaginationMeta(
  total: number,
  page: number,
  perPage: number
): PaginationMeta {
  const totalPages = Math.ceil(total / perPage);
  return {
    page,
    perPage,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
}

/**
 * Calculate Prisma skip/take from page and perPage.
 */
export function paginationToSkipTake(page: number, perPage: number) {
  return {
    skip: (page - 1) * perPage,
    take: perPage,
  };
}

/**
 * Parse and validate a request body as JSON.
 * Returns the parsed body or an error response.
 */
export async function parseBody<T>(
  request: Request,
  schema: { parse: (data: unknown) => T }
): Promise<{ data: T; error?: never } | { data?: never; error: NextResponse }> {
  try {
    const body = await request.json();
    const data = schema.parse(body);
    return { data };
  } catch (err: unknown) {
    if (err instanceof Error && "issues" in err) {
      // Zod error
      const zodErr = err as Error & { issues: { message: string; path: (string | number)[] }[] };
      const messages = zodErr.issues.map(
        (i) => `${i.path.join(".")}: ${i.message}`
      );
      return { error: errorResponse(messages.join("; "), 422) };
    }
    return { error: errorResponse("Invalid request body", 400) };
  }
}
