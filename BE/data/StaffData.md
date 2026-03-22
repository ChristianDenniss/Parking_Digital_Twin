# UNBSJ Staff Estimation & Campus Presence Model

## 1. Total Staff Estimation

### Data

- Total UNB staff: ~3,200
- UNB students: ~10,800–12,200
- UNBSJ students: ~2,200–3,200

### Assumption

- Staff ∝ student population

### Calculation

- UNBSJ share: 20–30%
- Staff estimate: 3,200 × (0.20–0.30) = **~650–950**

---

## 2. Staff Distribution


| Category       | % Range | Count Range |
| -------------- | ------- | ----------- |
| Academic       | 25–30%  | 160–280     |
| Administrative | 30–35%  | 200–330     |
| Support        | 25–30%  | 160–280     |
| Casual         | 10–15%  | 65–140      |


---

## 3. Work Mode Distribution


| Type    | % Range | Count Range |
| ------- | ------- | ----------- |
| Remote  | 5–10%   | 30–90       |
| Hybrid  | 30–40%  | 200–350     |
| On-site | 50–60%  | 350–550     |


---

## 4. Peak Presence (Weekday 10AM–3PM)

### Assumptions

- Academic: 50–70%
- Admin: 70–90%
- Support: 80–100%
- Casual: ~50%

### Result

- **~485–660 staff on campus**

---

## 5. Time-of-Day Distribution

Used by `BE/scripts/generate-campus-occupancy-from-scrape.mjs` for `nonTeachingStaffOnCampusMin` / `Max` on each slot in `pplOnCampusByTime.json`. Blocks partition the day (slot **start** time uses the row where `start ≤ t < end` in 24h local time).


| Time block (local)  | Staff range |
| ------------------- | ----------- |
| 12:00 AM – 6:00 AM  | 30–80       |
| 6:00 AM – 8:00 AM   | 200–400     |
| 8:00 AM – 10:00 AM  | 350–550     |
| 10:00 AM – 3:00 PM  | 500–650     |
| 3:00 PM – 6:00 PM   | 350–500     |
| 6:00 PM – 10:00 PM  | 100–250     |
| 10:00 PM – 12:00 AM | 30–80       |

Estimated **vehicles** from non-teaching staff use `nonTeachingStaffOnCampusMin`/`Max` × **0.58–0.88** in `pplOnCampusByTime.json` (see `parkingVehicleModel` there); combine with student/instructor vehicle fields for total cars per slot.

---

## 6. Overnight Staffing Breakdown


| Role       | Count Range |
| ---------- | ----------- |
| Security   | 10–25       |
| Facilities | 15–40       |
| Residence  | 5–15        |
| IT / Other | 2–10        |


### Total

- **~30–80 staff**

---

## 7. Overnight Percentage

### Calculation

- 30 / 950 ≈ 3%
- 80 / 650 ≈ 12%

### Final Range

- **4–10%**

### Recommended Value

- **~7%**

---

## 8. Night Phase Distribution


| Time Block | % of Staff |
| ---------- | ---------- |
| 6–10 PM    | 15–25%     |
| 10 PM–2 AM | 5–10%      |
| 2–6 AM     | 4–8%       |


---

## 9. Key Metrics

- Peak presence: **60–70%**
- Random-time presence: **40–50%**
- Night / after-hours presence: **4–10% (~7% recommended)**

---

## 10. Model Characteristics

- Range-based uncertainty handling
- Role-constrained overnight staffing
- Hybrid-adjusted daytime presence
- Time-block discretization

