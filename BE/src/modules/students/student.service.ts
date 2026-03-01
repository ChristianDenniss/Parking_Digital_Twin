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
  studentId: string;
  email: string;
  name: string;
  year?: number | null;
}): Promise<Student> {
  const student = repo().create({
    studentId: data.studentId,
    email: data.email,
    name: data.name,
    year: data.year ?? null,
  });
  return repo().save(student);
}

export async function update(
  id: string,
  data: Partial<{ studentId: string; email: string; name: string; year: number | null }>
): Promise<Student | null> {
  const student = await repo().findOne({ where: { id } });
  if (!student) return null;
  Object.assign(student, data);
  return repo().save(student);
}
