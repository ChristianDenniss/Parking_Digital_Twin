import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
} from "typeorm";
import { ParkingSpot } from "../parkingSpots/parkingSpot.entity";

@Entity("parking_lots")
export class ParkingLot {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column()
  name!: string;

  @Column({ default: "UNB Saint John" })
  campus!: string;

  @Column("integer")
  capacity!: number;

  @Column({ type: "text", nullable: true })
  imageUrl!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @OneToMany(() => ParkingSpot, (spot) => spot.parkingLot)
  spots!: ParkingSpot[];
}
