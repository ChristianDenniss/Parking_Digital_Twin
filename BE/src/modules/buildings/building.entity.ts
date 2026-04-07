import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
} from "typeorm";
import { LotBuildingDistance } from "./lotBuildingDistance.entity";

@Entity("buildings")
export class Building {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column()
  name!: string;

  /** Optional code to match course.building (e.g. "Ganong Hall") */
  @Column({ type: "text", nullable: true })
  code!: string | null;

  /** Number of floors in the building. */
  @Column("integer", { nullable: true })
  floors!: number | null;

  @CreateDateColumn()
  createdAt!: Date;

  @OneToMany(() => LotBuildingDistance, (d) => d.building)
  lotDistances!: LotBuildingDistance[];
}
