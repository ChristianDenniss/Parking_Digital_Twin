import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
} from "typeorm";

@Entity("historical_proxy_data")
export class HistoricalProxyData {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column()
  sourceName!: string;

  @Column()
  recordedAt!: Date;

  @Column("real")
  occupancyPct!: number;

  @Column("simple-json", { nullable: true })
  snapshot!: Record<string, unknown> | null;

  @Column("simple-json", { nullable: true })
  metadata!: Record<string, unknown> | null;
}
