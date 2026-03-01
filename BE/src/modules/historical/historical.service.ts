import { AppDataSource } from "../../db/data-source";
import { HistoricalProxyData } from "./historical.entity";

const repo = () => AppDataSource.getRepository(HistoricalProxyData);

export async function findAll(): Promise<HistoricalProxyData[]> {
  return repo().find({ order: { recordedAt: "DESC" } });
}

export async function findById(id: string): Promise<HistoricalProxyData | null> {
  return repo().findOne({ where: { id } });
}

export async function create(data: {
  sourceName: string;
  occupancyPct: number;
  snapshot?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}): Promise<HistoricalProxyData> {
  const row = repo().create({
    sourceName: data.sourceName,
    occupancyPct: data.occupancyPct,
    snapshot: data.snapshot ?? null,
    metadata: data.metadata ?? null,
    recordedAt: new Date(),
  });
  return repo().save(row);
}
