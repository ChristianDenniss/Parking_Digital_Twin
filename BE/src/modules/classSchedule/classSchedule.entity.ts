import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { Student } from "../students/student.entity";
import { Course } from "../classes/course.entity";

@Entity("class_schedule")
export class ClassSchedule {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column("uuid")
  studentId!: string;

  @Column("uuid")
  classId!: string;

  @Column({ type: "text", nullable: true })
  term!: string | null;

  @Column({ type: "text", nullable: true })
  section!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @ManyToOne(() => Student, (student) => student.classSchedules, { onDelete: "CASCADE" })
  @JoinColumn({ name: "studentId" })
  student!: Student;

  @ManyToOne(() => Course, (c) => c.classSchedules, { onDelete: "CASCADE" })
  @JoinColumn({ name: "classId" })
  course!: Course;
}
