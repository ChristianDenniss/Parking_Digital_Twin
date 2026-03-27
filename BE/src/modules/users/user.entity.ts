import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToOne,
} from "typeorm";
import { Student } from "../students/student.entity";

@Entity("users")
export class User {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ unique: true })
  email!: string;

  @Column()
  passwordHash!: string;

  @Column({ type: "text", nullable: true })
  name!: string | null;

  /** Staff, student, or PhD candidate; used to filter eligible parking (e.g. staff, PhD, resident, general). */
  @Column({ type: "text", default: "student" })
  role!: "staff" | "student" | "phd_candidate";

  /** On-campus resident; eligible for resident parking lots. */
  @Column({ type: "boolean", default: false })
  resident!: boolean;

  /**
   * User requires an accessible / disabled parking stall when recommending spots.
   * (Named `disabled` to match campus parking permit language.)
   */
  @Column({ type: "boolean", default: false })
  disabled!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @OneToOne(() => Student, (student) => student.user)
  student!: Student | null;
}
