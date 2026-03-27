import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { ParkingSpot } from "../parkingSpots/parkingSpot.entity";

@Entity("parking_spot_readings")
export class ParkingSpotLog {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column("uuid")
  parkingSpotId!: string;

  @Column({ type: "text" })
  status!: "occupied" | "empty";

  @Column()
  recordedAt!: Date;

  @ManyToOne(() => ParkingSpot, (spot) => spot.logs, { onDelete: "CASCADE" })
  @JoinColumn({ name: "parkingSpotId" })
  parkingSpot!: ParkingSpot;
}

