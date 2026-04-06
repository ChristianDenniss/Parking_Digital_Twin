import { AppDataSource } from "../../db/data-source";
import { CampusParameter } from "./campusParameter.entity";

const DEFAULT_PARAMS: Array<{ key: string; value: number; description: string }> = [
  { key: "carpool_rate",          value: 0.12, description: "Fraction of students who share a car with ≥1 other person" },
  { key: "non_driver_rate",       value: 0.35, description: "Fraction of students who arrive by foot, bus, or bicycle" },
  { key: "effective_driver_rate", value: 0.53, description: "Derived: 1 − non_driver_rate − carpool_rate/2  (do not edit directly)" },
  { key: "absence_rate",          value: 0.15, description: "Average daily absence fraction across all enrolled students" },
  { key: "friday_absence_mult",   value: 1.33, description: "Multiplier on absence_rate for Fridays (~20% absent)" },
  { key: "monday_absence_mult",   value: 1.13, description: "Multiplier on absence_rate for Mondays (~17% absent)" },
];

/** Day-of-week → absence multiplier key.  getDay(): 0=Sun,1=Mon,…,5=Fri,6=Sat */
const DOW_ABSENCE_KEY: Record<number, string | null> = {
  0: null,
  1: "monday_absence_mult",
  2: null,
  3: null,
  4: null,
  5: "friday_absence_mult",
  6: null,
};

function repo() {
  return AppDataSource.getRepository(CampusParameter);
}

export async function ensureDefaults(): Promise<void> {
  for (const p of DEFAULT_PARAMS) {
    const existing = await repo().findOne({ where: { key: p.key } });
    if (!existing) {
      await repo().save(repo().create(p));
    }
  }
}

export async function getParam(key: string): Promise<number | null> {
  const row = await repo().findOne({ where: { key } });
  return row?.value ?? null;
}

export async function setParam(key: string, value: number): Promise<void> {
  let row = await repo().findOne({ where: { key } });
  if (!row) {
    row = repo().create({ key, value });
  } else {
    row.value = value;
  }
  await repo().save(row);

  // Keep effective_driver_rate in sync when carpool or non_driver rates change
  if (key === "carpool_rate" || key === "non_driver_rate") {
    const carpoolRate   = (await getParam("carpool_rate"))   ?? 0.12;
    const nonDriverRate = (await getParam("non_driver_rate")) ?? 0.35;
    const effective     = 1 - nonDriverRate - carpoolRate / 2;
    await setParam("effective_driver_rate", Math.max(0, Math.min(1, effective)));
  }
}

export async function listAll(): Promise<CampusParameter[]> {
  return repo().find({ order: { key: "ASC" } });
}

/**
 * Returns the effective driver multiplier for demand prediction at a given hour
 * on a given day of week.
 *
 * formula: effective_driver_rate × (1 − absence_rate × dow_absence_multiplier)
 */
export async function getDemandMultiplier(dayOfWeek: number): Promise<number> {
  const effectiveDriverRate = (await getParam("effective_driver_rate")) ?? 0.53;
  const absenceRate         = (await getParam("absence_rate"))          ?? 0.15;
  const dowKey              = DOW_ABSENCE_KEY[dayOfWeek] ?? null;
  const absenceMult         = dowKey ? ((await getParam(dowKey)) ?? 1.0) : 1.0;

  return Math.max(0, Math.min(1, effectiveDriverRate * (1 - absenceRate * absenceMult)));
}
