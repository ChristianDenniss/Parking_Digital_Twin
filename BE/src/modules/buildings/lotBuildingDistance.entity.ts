import {
  Entity,
  PrimaryColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { ParkingLot } from "../parkingLots/parkingLot.entity";
import { Building } from "./building.entity";

/** Relationship table: parking lot ↔ building with walking distance in meters. */
@Entity("lot_building_distances")
export class LotBuildingDistance {
  @PrimaryColumn("uuid")
  parkingLotId!: string;

  @PrimaryColumn("uuid")
  buildingId!: string;

  @Column("real")
  distanceMeters!: number;

  @ManyToOne(() => ParkingLot, { onDelete: "CASCADE" })
  @JoinColumn({ name: "parkingLotId" })
  parkingLot!: ParkingLot;

  @ManyToOne(() => Building, (b) => b.lotDistances, { onDelete: "CASCADE" })
  @JoinColumn({ name: "buildingId" })
  building!: Building;
}
