-- Initial PostgreSQL schema for Supabase (matches current TypeORM entities).
-- Run in Supabase SQL editor, then point BE DATABASE_URL at the project.

create extension if not exists pgcrypto;

create table if not exists public.parking_lots (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  campus text not null default 'UNB Saint John',
  capacity integer not null,
  "imageUrl" text,
  "createdAt" timestamptz not null default now()
);

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  "passwordHash" text not null,
  name text,
  role text not null default 'student',
  resident boolean not null default false,
  disabled boolean not null default false,
  "createdAt" timestamptz not null default now()
);

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  "userId" uuid,
  "studentId" text not null,
  email text not null,
  name text not null,
  year integer,
  "createdAt" timestamptz not null default now(),
  constraint "fk_students_userId_users_id"
    foreign key ("userId") references public.users(id) on delete set null
);

create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  "classCode" text not null,
  "startTime" text not null,
  "endTime" text not null,
  name text,
  term text,
  building text,
  room text,
  "sectionCode" text,
  enrolled integer,
  capacity integer,
  "createdAt" timestamptz not null default now()
);

create table if not exists public.class_schedule (
  id uuid primary key default gen_random_uuid(),
  "studentId" uuid not null,
  "classId" uuid not null,
  term text,
  section text,
  "createdAt" timestamptz not null default now(),
  constraint "fk_class_schedule_studentId_students_id"
    foreign key ("studentId") references public.students(id) on delete cascade,
  constraint "fk_class_schedule_classId_classes_id"
    foreign key ("classId") references public.classes(id) on delete cascade
);

create table if not exists public.parking_spots (
  id uuid primary key default gen_random_uuid(),
  "parkingLotId" uuid not null,
  label text not null,
  section text not null default '',
  row text not null default '',
  "index" integer not null default 0,
  "slotIndex" integer,
  "currentStatus" text not null default 'empty',
  "updatedAt" timestamptz not null default now(),
  constraint "fk_parking_spots_parkingLotId_parking_lots_id"
    foreign key ("parkingLotId") references public.parking_lots(id) on delete cascade
);

create table if not exists public.parking_spot_readings (
  id uuid primary key default gen_random_uuid(),
  "parkingSpotId" uuid not null,
  status text not null,
  "recordedAt" timestamptz not null,
  constraint "fk_parking_spot_readings_parkingSpotId_parking_spots_id"
    foreign key ("parkingSpotId") references public.parking_spots(id) on delete cascade
);

create table if not exists public.historical_proxy_data (
  id uuid primary key default gen_random_uuid(),
  "sourceName" text not null,
  "recordedAt" timestamptz not null,
  "occupancyPct" double precision not null,
  snapshot text,
  metadata text
);

create table if not exists public.buildings (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text,
  floors integer,
  "createdAt" timestamptz not null default now()
);

create table if not exists public.lot_building_distances (
  "parkingLotId" uuid not null,
  "buildingId" uuid not null,
  "distanceMeters" double precision not null,
  primary key ("parkingLotId", "buildingId"),
  constraint "fk_lot_building_distances_parkingLotId_parking_lots_id"
    foreign key ("parkingLotId") references public.parking_lots(id) on delete cascade,
  constraint "fk_lot_building_distances_buildingId_buildings_id"
    foreign key ("buildingId") references public.buildings(id) on delete cascade
);

create index if not exists "idx_parking_spots_parkingLotId"
  on public.parking_spots ("parkingLotId");
create index if not exists "idx_parking_spot_readings_parkingSpotId"
  on public.parking_spot_readings ("parkingSpotId");
create index if not exists "idx_class_schedule_studentId"
  on public.class_schedule ("studentId");
create index if not exists "idx_class_schedule_classId"
  on public.class_schedule ("classId");
create index if not exists "idx_students_userId"
  on public.students ("userId");
