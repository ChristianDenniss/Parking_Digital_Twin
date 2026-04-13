# Student Behavioral Assumptions (UNBSJ)

---

## 1. Residence vs Commuter Split (known institutional values)

These counts are treated as **fixed** for the model (not a band).

### Data (institutional, current term)

- **Campus residents (approximate, current):** **300** students living in UNBSJ residence.
- **Enrolment head count — March 15** (paid and not paid):
  - Graduate: **158**
  - Undergraduate: **2,161**
  - **Total: 2,319**

### Derived split (total enrolment as denominator)

- Residence students: **300 / 2,319**
- Commuters (non-residence): **2,019 / 2,319** (2,319 − 300)

### Model Values (exact)

residence_rate = **300 / 2,319**  
commuter_rate = **2,019 / 2,319**  

All parking scenarios use **this** commuter_rate. Uncertainty lives in attendance and mode split (§2–§4), not in replacing these fractions with guesses.

---

## 2. Class Attendance / Skip Rate (uncertain — use ranges)

### Data

- National Survey of Student Engagement (NSSE) and institutional studies often cite average attendance **70–85%**; discipline mix shifts the band.

### Assumption

- Attendance rate: **75–85%**
- Skip rate: **15–25%**

### Decision

- Use **range endpoints** for low / high vehicle scenarios (§8), not the midpoint alone.

### Midpoint (reference only)

attendance_rate ≈ **0.80** · skip_rate ≈ **0.20**

---

## 3. Commuter Transportation Mode Split (commuters only)

Solo, carpool, transit, walk, and other sum to **1.0** over commuters. Only solo and carpool enter the parking vehicle formula (§5).

### Data (UNBSJ-specific)

**UNB CTRL Report 009** (2024 UNB commuter survey, UNBSJ student respondents, primary mode = longest-distance leg): passenger vehicle **65%** (drive alone **53%**, drive with others **12%**), public transit **30%**, walk **5%**, bicycle/e-scooter negligible, other **0%** on the published Saint John table [^ctrl009].

Those shares are **self-reported** and mix undergrad/grad (graduates were overrepresented in the Saint John response pool); they still anchor the model better than generic North American defaults.

### Uncertainty band (for §8 scenarios)

Survey sampling and wording add error bars. **Low vehicle** scenarios assume more transit/walk and less solo driving than the point estimate; **high vehicle** scenarios assume more solo driving and rideshare.

### Midpoint (reference — matches Report 009 point estimates)

solo_driver_rate = **0.53** · carpool_rate = **0.12** (drive with others, including drop-off) · transit_rate = **0.30** · walk_rate = **0.05** · other_rate = **0.00**

[^ctrl009]: D. Higdon and T. Hanson, *Summary Report: UNB 2024 Student Travel Trends* (UNB CTRL Report 009, 2025, draft), Table 5 — primary mode, Saint John.

### Constraint

solo_driver_rate + carpool_rate + transit_rate + walk_rate + other_rate = 1.0  

---

## 4. Carpool Size (uncertain)

### Data / assumption

- Typical carpool size: **2.0–2.5** people per vehicle

### Midpoint (reference only)

avg_carpool_size ≈ **2.2**  

---

## 5. Parking Demand Contribution

### Logic

- Only vehicle-based commuters contribute to parking demand (solo + carpool terms below).
- Transit, walking, biking do not generate parking load.

### Calculation

vehicles =
    (commuter_students × solo_driver_rate)
  + (commuter_students × carpool_rate / avg_carpool_size)

where commuter_students = enrolled_in_class × attendance_rate × **commuter_rate** (§1 exact, §2 band).

---

## 6. Key Modeling Assumptions Summary

- Residence students do not generate parking demand.
- **§1** commuter share is fixed from headcount; **§2–§4** supply the uncertainty band for vehicles.
- Carpooling reduces vehicle count via the **1 / avg_carpool_size** term.

---

## 7. Model Characteristics

- **Known:** March 15 enrolment and **300** on-campus residents → **2,019 / 2,319** commuter share.
- **Uncertain:** attendance, commuter mode split, carpool size → expressed as ranges and as **low / high** scenario endpoints in §8.

---

## 8. Parking / vehicles (integration)

`BE/scripts/generate-campus-occupancy-from-scrape.mjs` builds **low / high** student vehicle counts per time slot from `totalEnrolledInClass`. **Both** scenarios use **commuter_share = 2,019 / 2,319** (§1). Endpoints bracket **§3** (CTRL Report 009) on mode split and **§2** on attendance:

- **Low scenario (fewer cars):** attendance **75%**, commuter share **2,019 / 2,319**, solo driver **48%**, carpool **10%**, carpool size **2.5** (more transit/walk implied in the residual share)
- **High scenario (more cars):** attendance **85%**, commuter share **2,019 / 2,319**, solo driver **58%**, carpool **15%**, carpool size **2.0**

Formula per §5: `commuters × solo_rate + commuters × carpool_rate / carpool_size` (transit/other → 0 vehicles).

**Instructors:** **0.74–0.94** vehicles per assumed instructor (range; NB workforce prior — StaffData.md).  
**Non-teaching staff:** staff headcount range for the slot (StaffData.md §5) × **0.68–0.92** vehicles per person (NB workforce is highly auto-oriented; see StaffData.md).

Same double-count caveats as headcount if a person appears in both staff and classroom series.
