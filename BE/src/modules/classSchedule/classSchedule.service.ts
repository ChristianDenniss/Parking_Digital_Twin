import { AppDataSource } from "../../db/data-source";
import { ClassSchedule } from "./classSchedule.entity";

const repo = () => AppDataSource.getRepository(ClassSchedule);

export async function findAll(
  filters: { studentId?: string | null; classId?: string | null } = {},
  relations: string[] = []
): Promise<ClassSchedule[]> {
  const where: { studentId?: string; classId?: string } = {};
  if (filters.studentId) where.studentId = filters.studentId;
  if (filters.classId) where.classId = filters.classId;
  return repo().find({
    where: Object.keys(where).length ? where : undefined,
    relations: relations.length ? (relations as ("course" | "student")[]) : undefined,
    order: { createdAt: "DESC" },
  });
}

export async function countByClassId(classId: string): Promise<number> {
  return repo().count({ where: { classId } });
}

export async function findById(id: string): Promise<ClassSchedule | null> {
  return repo().findOne({ where: { id } });
}

export async function create(data: {
  studentId: string;
  classId: string;
  term?: string | null;
  section?: string | null;
}): Promise<ClassSchedule> {
  const entry = repo().create({
    studentId: data.studentId,
    classId: data.classId,
    term: data.term ?? null,
    section: data.section ?? null,
  });
  return repo().save(entry);
}

export async function remove(id: string): Promise<ClassSchedule | null> {
  const entry = await repo().findOne({ where: { id } });
  if (!entry) return null;
  await repo().remove(entry);
  return entry;
}
