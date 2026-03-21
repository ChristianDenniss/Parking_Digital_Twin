import { z } from "zod";

const roleEnum = z.enum(["staff", "student", "phd_candidate"]);

export const createUserSchema = z
  .object({
    email: z.string().min(1, { message: "Email is required" }).email("Invalid email").trim(),
    password: z.string().min(8, { message: "Password must be at least 8 characters" }),
    name: z.string().min(1, { message: "Name is required" }).trim(),
    role: roleEnum.default("student"),
    resident: z.coerce.boolean().default(false),
    /** Accessible / disabled parking stall eligibility */
    disabled: z.coerce.boolean().default(false),
    studentId: z.string().trim().optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.role === "student" || data.role === "phd_candidate") {
      const sid = data.studentId?.trim();
      if (!sid) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Student ID is required for student and PhD candidate accounts",
          path: ["studentId"],
        });
      }
    }
  });

export const updateUserSchema = z
  .object({
    email: z.string().email("Invalid email").trim().optional(),
    password: z.string().min(8, { message: "Password must be at least 8 characters" }).optional(),
    name: z.string().trim().optional().nullable(),
    role: roleEnum.optional(),
    resident: z.coerce.boolean().optional(),
    disabled: z.coerce.boolean().optional(),
  })
  .strict();

/** Authenticated user profile update; no password. */
export const patchMeSchema = z
  .object({
    name: z.string().min(1, { message: "Name cannot be empty" }).trim().optional(),
    email: z.string().email("Invalid email").trim().optional(),
    role: roleEnum.optional(),
    resident: z.coerce.boolean().optional(),
    disabled: z.coerce.boolean().optional(),
    /** Required when changing to student/PhD from staff (no linked student yet). */
    studentId: z.string().trim().optional(),
  })
  .strict()
  .refine(
    (d) =>
      d.name !== undefined ||
      d.email !== undefined ||
      d.role !== undefined ||
      d.resident !== undefined ||
      d.disabled !== undefined ||
      d.studentId !== undefined,
    { message: "At least one field is required to update" }
  );

export const loginSchema = z
  .object({
    email: z.string().min(1, { message: "Email is required" }).email("Invalid email").trim(),
    password: z.string().min(1, { message: "Password is required" }),
  })
  .strict();

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type PatchMeInput = z.infer<typeof patchMeSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
