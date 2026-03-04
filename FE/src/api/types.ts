export interface ParkingLot {
  id: string;
  name: string;
  campus: string;
  capacity: number;
  imageUrl: string | null;
  createdAt: string;
}

export interface ParkingSpot {
  id: string;
  parkingLotId: string;
  label: string;
  section: string;
  row: string;
  index: number;
  currentStatus: "occupied" | "empty";
  updatedAt: string;
}

export interface ParkingSpotLog {
  id: string;
  parkingSpotId: string;
  status: "occupied" | "empty";
  recordedAt: string;
  /** Present when API loads the parkingSpot relation (includes label for display). */
  parkingSpot?: { id: string; label: string };
}

export interface AuthResponse {
  user: { id: string; email: string; name: string | null; createdAt: string };
  token: string;
}

export interface MeResponse {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
  student: {
    id: string;
    studentId: string;
    email: string;
    name: string;
    year: number | null;
  } | null;
}
