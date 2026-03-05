/**
 * Import courses from scraped JSON into the database.
 * Run once when you have the real data; seed.ts does not create or delete courses.
 *
 * Usage:
 *   npx ts-node scripts/seed-courses.ts <path-to-courses.json> [--replace]
 *
 * --replace  Clear all courses (and class_schedule) first, then insert. Without it,
 *            skips rows that already exist (same classCode + startTime + term).
 *
 * JSON format: array of objects with at least classCode, startTime, endTime.
 * Optional: name, term, building, room.
 *
 * Example:
 *   [
 *     { "classCode": "CS1013", "startTime": "08:30", "endTime": "09:50", "name": "Intro to Programming", "term": "2024-2025 Fall", "building": "Ganong Hall", "room": "101" },
 *     ...
 *   ]
 */

import "reflect-metadata";
import { readFileSync } from "fs";
import { resolve } from "path";
import { AppDataSource } from "../src/db/data-source";
import { Course } from "../src/modules/classes/course.entity";
import { ClassSchedule } from "../src/modules/classSchedule/classSchedule.entity";

const REPLACE = process.argv.includes("--replace");
const fileArg = process.argv.find((a) => !a.startsWith("--") && a.endsWith(".json"));

if (!fileArg) {
  console.error("Usage: npx ts-node scripts/seed-courses.ts <path-to-courses.json> [--replace]");
  process.exit(1);
}

const filePath = resolve(process.cwd(), fileArg);

interface CourseRow {
  classCode: string;
  startTime: string;
  endTime: string;
  name?: string | null;
  term?: string | null;
  building?: string | null;
  room?: string | null;
}

function parseRows(content: string): CourseRow[] {
  const raw = JSON.parse(content);
  if (!Array.isArray(raw)) {
    throw new Error("JSON must be an array of course objects");
  }
  return raw.map((row: unknown) => {
    const o = row as Record<string, unknown>;
    const classCode = typeof o.classCode === "string" ? o.classCode.trim() : String(o.classCode ?? "").trim();
    const startTime = typeof o.startTime === "string" ? o.startTime.trim() : String(o.startTime ?? "").trim();
    const endTime = typeof o.endTime === "string" ? o.endTime.trim() : String(o.endTime ?? "").trim();
    if (!classCode || !startTime || !endTime) {
      throw new Error(`Each row must have classCode, startTime, endTime. Got: ${JSON.stringify(row)}`);
    }
    return {
      classCode,
      startTime,
      endTime,
      name: typeof o.name === "string" ? o.name.trim() || null : null,
      term: typeof o.term === "string" ? o.term.trim() || null : null,
      building: typeof o.building === "string" ? o.building.trim() || null : null,
      room: typeof o.room === "string" ? o.room.trim() || null : null,
    };
  });
}

async function main() {
  const content = readFileSync(filePath, "utf-8");
  const rows = parseRows(content);
  console.log(`Loaded ${rows.length} courses from ${filePath}`);

  await AppDataSource.initialize();
  const courseRepo = AppDataSource.getRepository(Course);
  const scheduleRepo = AppDataSource.getRepository(ClassSchedule);

  if (REPLACE) {
    const scheduleCount = await scheduleRepo.count();
    const courseCount = await courseRepo.count();
    if (scheduleCount > 0) await scheduleRepo.createQueryBuilder().delete().execute();
    if (courseCount > 0) await courseRepo.createQueryBuilder().delete().execute();
    console.log(`Cleared ${courseCount} courses and ${scheduleCount} class_schedule rows.`);
  }

  let inserted = 0;
  let skipped = 0;
  const BATCH = 100;

  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    for (const row of chunk) {
      if (!REPLACE) {
        const existing = await courseRepo.findOne({
          where: {
            classCode: row.classCode,
            startTime: row.startTime,
            term: row.term ?? null,
          },
        });
        if (existing) {
          skipped++;
          continue;
        }
      }
      const course = courseRepo.create({
        classCode: row.classCode,
        startTime: row.startTime,
        endTime: row.endTime,
        name: row.name ?? null,
        term: row.term ?? null,
        building: row.building ?? null,
        room: row.room ?? null,
      });
      await courseRepo.save(course);
      inserted++;
    }
  }

  console.log(`Done. Inserted: ${inserted}, skipped (already exist): ${skipped}. Total courses now: ${await courseRepo.count()}.`);
  await AppDataSource.destroy();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
