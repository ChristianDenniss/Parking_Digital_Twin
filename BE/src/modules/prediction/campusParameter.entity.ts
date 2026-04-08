import { Entity, PrimaryColumn, Column, UpdateDateColumn } from "typeorm";

/**
 * Key-value store for campus-wide behavioural parameters used by the
 * prediction and activity-curve models.
 *
 * Keys (seeded by default):
 *   carpool_rate           — fraction of students sharing a car (default 0.12)
 *   non_driver_rate        — fraction arriving by foot/bus/bike (default 0.35)
 *   effective_driver_rate  — computed: 1 − non_driver_rate − carpool_rate/2
 *   absence_rate           — avg daily absence fraction across all enrolled (default 0.15)
 *   friday_absence_mult    — multiplier on absence_rate for Fridays (default 1.33)
 *   monday_absence_mult    — multiplier on absence_rate for Mondays (default 1.13)
 */
@Entity("campus_parameters")
export class CampusParameter {
  @PrimaryColumn({ type: "text" })
  key!: string;

  @Column("real")
  value!: number;

  @Column({ type: "text", nullable: true })
  description!: string | null;

  @UpdateDateColumn()
  updatedAt!: Date;
}
