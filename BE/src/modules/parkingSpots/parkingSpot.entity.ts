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
  row!: string;

  @Column("integer", { default: 0 })
  index!: number;

  @Column({ type: "text", default: "empty" })
  currentStatus!: "occupied" | "empty";

  @UpdateDateColumn({ type: "datetime" })
  updatedAt!: Date;

  @ManyToOne(() => ParkingLot, (lot) => lot.spots, { onDelete: "CASCADE" })
  @JoinColumn({ name: "parkingLotId" })
  parkingLot!: ParkingLot;

  @OneToMany(() => ParkingSpotLog, (log) => log.parkingSpot)
  logs!: ParkingSpotLog[];
}

