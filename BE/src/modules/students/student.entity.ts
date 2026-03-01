import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
} from "typeorm";
import { ClassSchedule } from "../classSchedule/classSchedule.entity";

@Entity("students")
export class Student {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column()
  studentId!: string;

  @Column()
  email!: string;

  @Column()
  name!: string;

  @Column("integer", { nullable: true })
  year!: number | null;

  @CreateDateColumn({ type: "datetime" })
  createdAt!: Date;

  @OneToMany(() => ClassSchedule, (cs) => cs.student)
  classSchedules!: ClassSchedule[];
}
