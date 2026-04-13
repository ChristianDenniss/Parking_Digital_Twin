/**
 * Reset `campus_parameters` to code defaults (UNBSJ CTRL-informed values in campusParameter.service.ts).
 *
 * Run from BE/:  npm run reset-campus-params
 * Same idea as seed-replace for lots/spots, but only behavioural prediction parameters.
 */
import "reflect-metadata";
import { AppDataSource } from "../src/db/data-source";
import * as campusParameterService from "../src/modules/prediction/campusParameter.service";

async function main() {
  await AppDataSource.initialize();
  try {
    await campusParameterService.resetToDefaults();
    const rows = await campusParameterService.listAll();
    console.log("Campus parameters reset to defaults:");
    for (const r of rows) {
      console.log(`  ${r.key} = ${r.value}`);
    }
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
