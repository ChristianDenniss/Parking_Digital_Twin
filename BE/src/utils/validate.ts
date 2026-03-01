import { z, ZodSchema } from "zod";

export interface ValidateResult<T> {
  valid: boolean;
  errors: string[];
  data?: T;
}

export function validate<T>(schema: ZodSchema<T>, body: unknown): ValidateResult<T> {
  const result = schema.safeParse(body);
  if (result.success) {
    return { valid: true, errors: [], data: result.data };
  }
  const errors = result.error.issues.map(
    (issue) => (issue.path.length ? issue.path.join(".") + ": " : "") + issue.message
  );
  return { valid: false, errors, data: undefined };
}
