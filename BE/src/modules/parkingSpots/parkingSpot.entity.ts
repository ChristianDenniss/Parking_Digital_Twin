import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from "typeorm";
import { ParkingLot } from "../parkingLots/parkingLot.entity";
import { ParkingSpotLog } from "../parkingSpotLogs/parkingSpotLog.entity";

@Entity("parking_spots")
export class ParkingSpot {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column("uuid")
  parkingLotId!: string;

  @Column()
  label!: string;

  @Column({ default: "" })
  section!: string;

  @Column({ default: "" })
  row!: string;

  @Column("integer", { default: 0 })
  index!: number;

  /** 1-based order in the lot's SVG (spot layers in document order). Enables 1:1 match by position. */
  @Column("integer", { nullable: true })
  slotIndex!: number | null;

  @Column({ type: "text", default: "empty" })
  currentStatus!: "occupied" | "empty";

  @UpdateDateColumn()
  updatedAt!: Date;

  @ManyToOne(() => ParkingLot, (lot) => lot.spots, { onDelete: "CASCADE" })
  @JoinColumn({ name: "parkingLotId" })
  parkingLot!: ParkingLot;

  @OneToMany(() => ParkingSpotLog, (log) => log.parkingSpot)
  logs!: ParkingSpotLog[];
}

