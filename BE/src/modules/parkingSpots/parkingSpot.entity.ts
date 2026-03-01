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
import { ParkingSpotReading } from "./parkingSpotReading.entity";

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

  @OneToMany(() => ParkingSpotReading, (reading) => reading.parkingSpot)
  readings!: ParkingSpotReading[];
}
