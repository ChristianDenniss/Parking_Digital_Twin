import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { ParkingSpot } from "./parkingSpot.entity";

@Entity("parking_spot_readings")
export class ParkingSpotReading {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column("uuid")
  parkingSpotId!: string;

  @Column({ type: "text" })
  status!: "occupied" | "empty";

  @Column({ type: "datetime" })
  recordedAt!: Date;

  @ManyToOne(() => ParkingSpot, (spot) => spot.readings, { onDelete: "CASCADE" })
  @JoinColumn({ name: "parkingSpotId" })
  parkingSpot!: ParkingSpot;
}
