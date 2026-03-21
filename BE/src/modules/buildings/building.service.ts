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

/**
 * Match a course `building` string (e.g. "Hazen Hall") to a campus building row.
 * Handles shortened names vs full names (e.g. "Hazen Hall" → "Sir Douglas Hazen Hall").
 */
export async function findBuildingForCourseBuilding(courseBuilding: string | null | undefined): Promise<Building | null> {
  const raw = courseBuilding?.trim();
  if (!raw) return null;
  const q = raw.toLowerCase();
  const all = await findAll();

  const exact = all.find(
    (b) => b.name.toLowerCase() === q || (b.code != null && b.code.toLowerCase() === q)
  );
  if (exact) return exact;

  const contains = all.find(
    (b) =>
      b.name.toLowerCase().includes(q) ||
      q.includes(b.name.toLowerCase())
  );
  if (contains) return contains;

  const tokens = q.split(/\s+/).filter((t) => t.length > 2);
  if (tokens.length === 0) return null;

  let best: { b: Building; score: number } | null = null;
  for (const b of all) {
    const n = b.name.toLowerCase();
    let score = 0;
    for (const t of tokens) {
      if (n.includes(t)) score += t.length;
    }
    if (score > 0 && (!best || score > best.score)) best = { b, score };
  }
  return best?.b ?? null;
}
