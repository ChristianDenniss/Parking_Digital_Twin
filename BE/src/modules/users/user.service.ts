import * as bcrypt from "bcrypt";
import { AppDataSource } from "../../db/data-source";
import { User } from "./user.entity";

const repo = () => AppDataSource.getRepository(User);

const SALT_ROUNDS = 10;

export async function create(data: {
  email: string;
  password: string;
  name: string;
  role?: "staff" | "student" | "phd_candidate";
  resident?: boolean;
  disabled?: boolean;
}): Promise<User> {
  const passwordHash = await bcrypt.hash(data.password, SALT_ROUNDS);
  const user = repo().create({
    email: data.email.trim().toLowerCase(),
    passwordHash,
    name: data.name.trim(),
    role: data.role ?? "student",
    resident: data.resident ?? false,
    disabled: data.disabled ?? false,
  });
  return repo().save(user);
}

export async function findAll(): Promise<User[]> {
  return repo().find({ order: { createdAt: "DESC" } });
}

export async function findByEmail(email: string): Promise<User | null> {
  return repo().findOne({ where: { email: email.trim().toLowerCase() } });
}

export async function findById(id: string, withStudent = true): Promise<User | null> {
  return repo().findOne({
    where: { id },
    relations: withStudent ? { student: true } : undefined,
  });
}

export async function update(
  id: string,
  data: Partial<{
    email: string;
    password: string;
    name: string | null;
    role: "staff" | "student" | "phd_candidate";
    resident: boolean;
    disabled: boolean;
  }>
): Promise<User | null> {
  const user = await repo().findOne({ where: { id } });
  if (!user) return null;
  if (data.email !== undefined) user.email = data.email.trim().toLowerCase();
  if (data.name !== undefined) user.name = data.name;
  if (data.password !== undefined) user.passwordHash = await bcrypt.hash(data.password, SALT_ROUNDS);
  if (data.role !== undefined) user.role = data.role;
  if (data.resident !== undefined) user.resident = data.resident;
  if (data.disabled !== undefined) user.disabled = data.disabled;
  return repo().save(user);
}

export async function remove(id: string): Promise<User | null> {
  const user = await repo().findOne({ where: { id } });
  if (!user) return null;
  await repo().remove(user);
  return user;
}

export async function verifyPassword(user: User, password: string): Promise<boolean> {
  return bcrypt.compare(password, user.passwordHash);
}
