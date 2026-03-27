import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
  OneToOne,
  JoinColumn,
} from "typeorm";
import { ClassSchedule } from "../classSchedule/classSchedule.entity";
import { User } from "../users/user.entity";

@Entity("students")
export class Student {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column("uuid", { nullable: true })
  userId!: string | null;

  @Column()
  studentId!: string;

  @Column()
  email!: string;

  @Column()
  name!: string;

  @Column("integer", { nullable: true })
  year!: number | null;

  @CreateDateColumn()
  createdAt!: Date;

  @OneToOne(() => User, (u) => u.student, { onDelete: "SET NULL" })
  @JoinColumn({ name: "userId" })
  user!: User | null;

  @OneToMany(() => ClassSchedule, (cs) => cs.student)
  classSchedules!: ClassSchedule[];
}
