import { Entity, PrimaryColumn, Column, UpdateDateColumn } from "typeorm";

/**
 * DDM residual correction table for the hybrid prediction model.
 *
 * For each (lot_id, hour, day_of_week, period) slot, stores:
 *   mean_residual  — average of (observed_occupancy_pct − curve_predicted_pct)
 *   n_samples      — number of historical observations used to compute the mean
 *
 * The correction is applied in the prediction engine as:
 *   corrected = clip(curve_value + weight × mean_residual, 0, 100)
 *   weight    = tanh(n_samples / 10)  (saturates near 1.0 at ~30 samples)
 *
 * Populated by: BE/scripts/generateResiduals.ts
 */
@Entity("lot_occupancy_corrections")
export class LotOccupancyCorrection {
  @PrimaryColumn({ type: "text" })
  lotId!: string;

  @PrimaryColumn("integer")
  hour!: number;

  @PrimaryColumn("integer")
  dayOfWeek!: number; // 0=Sun … 6=Sat

  @PrimaryColumn({ type: "text" })
  period!: string;

  /** Signed residual in occupancy-% units (can be negative if curve over-estimates). */
  @Column("real")
  meanResidual!: number;

  @Column("integer")
  nSamples!: number;

  @UpdateDateColumn({ type: "datetime" })
  updatedAt!: Date;
}
