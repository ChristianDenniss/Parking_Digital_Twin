# Student Behavioral Assumptions (UNBSJ)

---

## 1. Residence vs Commuter Split

### Data
- Canadian university housing data (Universities Canada, institutional reports):
  - Residence population typically: **15–35%**
- Smaller / regional campuses:
  - Lower residence usage due to local commuting population
- UNBSJ context:
  - Limited residence capacity relative to total enrollment

### Assumption
- Residence students: **20–30%**
- Commuters: **70–80%**

### Decision
- Use midpoint for modeling

### Model Values
residence_rate = 0.25  
commuter_rate = 0.75  

---

## 2. Class Attendance / Skip Rate

### Data
- National Survey of Student Engagement (NSSE) and institutional studies:
  - Average attendance: **70–85%**
- STEM-heavy programs:
  - Tend toward higher attendance (~80–90%)
- General cross-discipline average:
  - ~75–85%

### Assumption
- Attendance rate: **75–85%**
- Skip rate: **15–25%**

### Decision
- Use central tendency for stability

### Model Values
attendance_rate = 0.80  
skip_rate = 0.20  

---

## 3. Commuter Transportation Mode Split

### Data
- Statistics Canada commuting data:
  - Car (driver): ~70–75%
  - Public transit: ~10–20%
  - Carpool: ~8–12%
  - Active (walk/bike): ~5–10%

### Context Adjustment (UNBSJ)
- Smaller city (Saint John):
  - Lower transit availability than major urban centers
- Campus location:
  - Limited walkability and cycling access
- Result:
  - Higher reliance on personal vehicles
  - Reduced active transportation

### Assumption (Adjusted Distribution — commuters only)
- Solo driver: **75–85%**
- Carpool: **5–15%**
- Public transit: **5–10%**
- Other (walk/bike/taxi): **0–5%**

### Decision
- Use realistic midpoint values aligned with regional behavior

### Model Values
solo_driver_rate = 0.80  
carpool_rate = 0.10  
transit_rate = 0.07  
other_rate = 0.03  

### Constraint
solo_driver_rate + carpool_rate + transit_rate + other_rate = 1.0  

---

## 4. Carpool Size

### Data
- Transportation studies (North America):
  - Typical carpool size: **2–3 people per vehicle**

### Assumption
- Average carpool size: **2.0–2.5**

### Decision
- Use midpoint for vehicle estimation stability

### Model Value
avg_carpool_size = 2.2  

---

## 5. Parking Demand Contribution

### Logic
- Only vehicle-based commuters contribute to parking demand
- Transit, walking, biking do not generate parking load

### Calculation

vehicles =
    (commuter_students * solo_driver_rate)
  + (commuter_students * carpool_rate / avg_carpool_size)

---

## 6. Key Modeling Assumptions Summary

- Residence students do not generate parking demand
- Majority of commuters (~85–90%) rely on cars
- Carpooling slightly reduces vehicle count but remains low impact
- Transit usage is limited due to regional constraints
- Active transportation is negligible

---

## 7. Model Characteristics

- Range-based assumptions converted to midpoint values
- Regional adjustment applied to national datasets
- Behavior constrained by infrastructure (location, transit availability)
- Designed for integration with time-based campus presence model

---

## 8. Parking / vehicles (integration)

`BE/scripts/generate-campus-occupancy-from-scrape.mjs` uses **§2–§5 ranges** to build **low / high** vehicle counts per time slot from `totalEnrolledInClass` in `pplOnCampusByTime.json`:

- **Low scenario:** attendance 75%, commuter share 70%, solo driver 75%, carpool 5%, carpool size 2.5  
- **High scenario:** attendance 85%, commuter share 80%, solo driver 85%, carpool 15%, carpool size 2.0  

Formula per §5: `commuters × solo_rate + commuters × carpool_rate / avg_carpool_size` (transit/other → 0 vehicles).

Instructors and non-teaching staff use separate drive-rate bands (see JSON `parkingVehicleModel`); same double-count caveats as headcount if a person appears in both staff and classroom series.