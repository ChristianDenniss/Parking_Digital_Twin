import { AppDataSource } from "../../db/data-source";
import { Student } from "./student.entity";

const repo = () => AppDataSource.getRepository(Student);

export async function findAll(): Promise<Student[]> {
  return repo().find({ order: { createdAt: "DESC" } });
}

export async function findById(id: string): Promise<Student | null> {
  return repo().findOne({ where: { id } });
}

export async function findByStudentId(studentId: string): Promise<Student | null> {
  return repo().findOne({ where: { studentId } });
}

export async function create(data: {
  userId?: string | null;
  studentId: string;
  email: string;
  name: string;
  year?: number | null;
}): Promise<Student> {
  const student = repo().create({
    userId: data.userId ?? null,
    studentId: data.studentId,
    email: data.email,
    name: data.name,
    year: data.year ?? null,
  });
  return repo().save(student);
}

export async function findByUserId(userId: string): Promise<Student | null> {
  return repo().findOne({ where: { userId } });
}

/** Detach the student profile from this user (e.g. role changed to staff). */
export async function clearUserLinkByUserId(userId: string): Promise<void> {
  const s = await findByUserId(userId);
  if (!s) return;
  s.userId = null;
  await repo().save(s);
}

export async function update(
  id: string,
  data: Partial<{ userId: string | null; studentId: string; email: string; name: string; year: number | null }>
): Promise<Student | null> {
  const student = await repo().findOne({ where: { id } });
  if (!student) return null;
  Object.assign(student, data);
  return repo().save(student);
}
