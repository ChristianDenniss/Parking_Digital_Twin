import { AppDataSource } from "../../db/data-source";
import { Building } from "./building.entity";

const repo = () => AppDataSource.getRepository(Building);

export async function findAll(): Promise<Building[]> {
  return repo().find({ order: { name: "ASC" } });
}

export async function findById(id: string): Promise<Building | null> {
  return repo().findOne({ where: { id } });
}

export async function create(data: {
  name: string;
  code?: string | null;
  floors?: number | null;
}): Promise<Building> {
  const b = repo().create({
    name: data.name,
    code: data.code ?? null,
    floors: data.floors ?? null,
  });
  return repo().save(b);
}

export async function update(
  id: string,
  data: Partial<{ name: string; code: string | null; floors: number | null }>
): Promise<Building | null> {
  const b = await repo().findOne({ where: { id } });
  if (!b) return null;
  if (data.name !== undefined) b.name = data.name;
  if (data.code !== undefined) b.code = data.code;
  if (data.floors !== undefined) b.floors = data.floors;
  return repo().save(b);
}

export async function remove(id: string): Promise<Building | null> {
  const b = await repo().findOne({ where: { id } });
  if (!b) return null;
  await repo().remove(b);
  return b;
}
