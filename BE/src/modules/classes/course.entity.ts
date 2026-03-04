import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
} from "typeorm";
import { ClassSchedule } from "../classSchedule/classSchedule.entity";

@Entity("classes")
export class Course {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column()
  classCode!: string;

  @Column()
  startTime!: string;

  @Column()
  endTime!: string;

  @Column({ type: "text", nullable: true })
  name!: string | null;

  @Column({ type: "text", nullable: true })
  term!: string | null;

  @Column({ type: "text", nullable: true })
  building!: string | null;

  @Column({ type: "text", nullable: true })
  room!: string | null;

  @CreateDateColumn({ type: "datetime" })
  createdAt!: Date;

  @OneToMany(() => ClassSchedule, (cs) => cs.course)
  classSchedules!: ClassSchedule[];
}
