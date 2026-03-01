# UNB Saint John Parking Digital Twin – Data Schema

Relational design, backed by **`BE/data/db.json`**.

## Entities

### `parkingLots`
| Column     | Type   | Description                    |
|------------|--------|--------------------------------|
| id         | string | UUID                           |
| name       | string | e.g. "Lot A", "Tilley Hall"   |
| campus     | string | e.g. "UNB Saint John"          |
| capacity   | number | Total spots                    |
| createdAt  | string | ISO timestamp                  |

### `parkingSpots`
| Column        | Type   | Description                          |
|---------------|--------|--------------------------------------|
| id            | string | UUID                                 |
| parkingLotId  | string | FK → parkingLots.id                  |
| label         | string | e.g. "A-01", "B-12"                  |
| row           | string | Row identifier                        |
| index         | number | Position in row                       |
| currentStatus | enum   | "occupied" \| "empty"                |
| updatedAt     | string | ISO timestamp of last status change  |

### `parking_spot_readings` (sensor / live simulation history)
| Column        | Type   | Description                |
|---------------|--------|----------------------------|
| id            | string | UUID                       |
| parkingSpotId | string | FK → parkingSpots.id       |
| status        | enum   | "occupied" \| "empty"      |
| recordedAt    | string | ISO timestamp              |

### `historical_proxy_data`
| Column      | Type   | Description                              |
|-------------|--------|------------------------------------------|
| id          | string | UUID                                     |
| sourceName  | string | e.g. "Similar Lot Downtown"              |
| recordedAt  | string | ISO timestamp                            |
| occupancyPct| number | 0–100                                    |
| snapshot    | object | Optional                                 |
| metadata    | object | Optional                                 |

### `students`
| Column    | Type   | Description                |
|-----------|--------|----------------------------|
| id        | string | UUID                       |
| studentId | string | Institutional student ID   |
| email     | string | Email                      |
| name      | string | Full name                  |
| year      | number | Year of study (1–10)       |
| createdAt | string | ISO timestamp              |

### `classes`
| Column    | Type   | Description                |
|-----------|--------|----------------------------|
| id        | string | UUID                       |
| classCode | string | e.g. "CS2043"              |
| startTime | string | e.g. "09:00" or ISO        |
| endTime   | string | e.g. "10:30" or ISO        |
| name      | string | Optional course name      |
| term      | string | Optional term/semester    |
| createdAt | string | ISO timestamp              |

### `class_schedule` (join: students ↔ classes)
| Column    | Type   | Description                |
|-----------|--------|----------------------------|
| id        | string | UUID                       |
| studentId | string | FK → students.id           |
| classId   | string | FK → classes.id            |
| term      | string | Optional                   |
| section   | string | Optional                   |
| createdAt | string | ISO timestamp              |

---

## JSON file layout (`BE/data/db.json`)

```json
{
  "parkingLots": [],
  "parkingSpots": [],
  "parking_spot_readings": [],
  "historical_proxy_data": [],
  "students": [],
  "classes": [],
  "class_schedule": []
}
```

IDs are UUIDs.
