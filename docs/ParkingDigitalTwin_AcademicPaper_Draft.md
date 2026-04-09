# A Campus Parking Digital Twin for Demand Forecasting and Decision Support at the University of New Brunswick Saint John

**Authors:** [Your Name], [Co-authors if any]  
**Affiliation:** University of New Brunswick Saint John, Canada  
**Draft for internal review —** *Target length: ~4,500 words (see course template). Structure informed by concise research-article form (e.g., ACM/IEEE companion papers); expand or tighten sections per your venue’s author kit.*

---

## Abstract

University campuses face recurring congestion and uncertainty in parking supply during peak instructional periods, special events, and term-to-term enrollment shifts. This paper reports the design and implementation of a **parking digital twin** for the UNB Saint John campus: a software system that couples a geometrically faithful representation of sixteen lots and approximately 1,230 stalls with a **hybrid prediction engine**, scenario (“what-if”) analysis, and personalized arrival planning tied to academic schedules. The twin integrates scraped course-catalog data, hand-curated behavioral assumptions about staff and student mobility, and a layered model that combines historical proxy records, type-specific occupancy curves, data-driven residual correction, enrollment-aware activity weighting, and optional event scaling. A web client provides interactive maps (Leaflet), satellite context via Google Earth Engine, role-based eligibility, and simulation-backed “live” and frozen-time scenario modes. We situate the work in the smart-campus and digital-twin literature, describe methodology and architecture, reference project diagrams, and map the implementation to **Oakes et al.’s fourteen-characteristic digital twin description framework** (with alignment notes for the **twenty-one-item systematic reporting synthesis** of Gil et al.). We conclude with limitations—most notably the absence of real sensor feeds and reliance on synthetic historical data for parts of the stack—and outline research directions toward observational calibration and production deployment.

**Keywords:** digital twin, smart campus, parking demand forecasting, hybrid modeling, decision support, experience report

---

## 1. Introduction

Parking is a constrained shared resource on urban and suburban university campuses. Decisions about where to park, when to arrive, and how large events reshape demand are typically made with incomplete information: static signage, anecdotal experience, and delayed administrative communication. At the same time, institutions already maintain rich **digital artifacts** of campus life—timetables, room assignments, enrollment counts—that can be fused with spatial models of lots and walkways to support anticipatory reasoning.

**Digital twins** have been proposed across domains as virtual counterparts of physical systems, maintained with data and models to support monitoring, prediction, and decision-making [1,2]. For parking, a twin should offer more than a map: it should encode **state** (occupancy or its distribution), **dynamics** (how demand evolves through the day and academic calendar), and **services** (recommendations, scenario comparison, accessibility-aware routing). The project described here implements such a system for UNB Saint John.

**Contributions** of this experience report are: (1) a concrete **domain characterization** of campus parking as a digital-twin problem; (2) a **methodological account** of a full-stack TypeScript implementation (React/Vite frontend, Node/Express backend, TypeORM, SQLite/PostgreSQL, optional Redis); (3) **integration patterns** for schedule-driven demand, hybrid prediction, and GIS-style visualization; (4) explicit **diagram references** from the project documentation; and (5) **structured characterization** using established digital-twin reporting frameworks [3,4].

The remainder of the paper is organized as follows. Section 2 defines the problem domain and related concepts. Section 3 presents methodology and system design. Section 4 details the prediction and recommendation logic. Section 5 maps the project to Oakes et al.’s characteristics and to the extended twenty-one-item reporting perspective. Section 6 discusses limitations and future work. Section 7 concludes.

From a **pedagogical** standpoint, the project demonstrates how digital-twin ideas—often illustrated with industrial robotics or precision agriculture—translate to **everyday university operations**. The parking domain is small enough to implement end-to-end in a two-tier web stack yet rich enough to require genuine systems integration: GIS-style assets, temporal reasoning, authentication, and performance considerations (caching, database choice). Reporting the work through Oakes et al.’s and Gil et al.’s lenses therefore serves double duty: it documents a software deliverable and **trains readers** to expect structured DT disclosures in future smart-campus research.

---

## 2. Domain and Background

### 2.1 Problem domain

The **system-under-study** is on-campus parking at UNB Saint John, comprising multiple lot types (general, staff, resident, timed, PhD-eligible, etc.), pedestrian connections to academic buildings, and time-varying demand driven by classes, exams, reading weeks, holidays, and discretionary travel. End users include students, staff, and visitors with differing **eligibility** and **objectives** (minimize walk time, maximize probability of finding a stall, respect accessibility needs).

### 2.2 Digital models, shadows, and twins

Kritzinger et al. distinguish **digital models**, **digital shadows**, and **digital twins** by the degree of automation in data flow from the physical system to the digital artifact and in control or actuation back to the physical system [5]. Under that taxonomy, many campus IT systems are **models** or **shadows**: they do not automatically ingest live stall-level occupancy from the physical lots, nor do they close the loop with gate or pricing actuators. The present implementation is best classified as a **high-fidelity model with simulated and schedule-driven state updates**, aspiring toward shadow/twin maturity once real sensors and operational integrations exist. We return to this in Section 5 when reporting data and action directions.

### 2.3 Related work

Digital twins for **agriculture**, **manufacturing**, and **urban mobility** are well represented in the literature; smart-campus parking specifically often appears as IoT occupancy detection, pricing, or optimization without a full twin stack [6]. This project emphasizes **transparent hybrid modeling** (interpretable baselines plus learned corrections), **scenario exploration**, and **individual planning** aligned with courses—design choices suited to institutional settings where governance of personal data and explainability matter.

Information-management perspectives for environmental or campus-scale twins stress layered pipelines from acquisition through visualization and security [7]. While our implementation does not instantiate every layer at production maturity, the codebase roughly aligns with **collection** (scraping, SVG ingestion), **integration** (relational schema, APIs), **analytics** (hybrid predictor, residuals), **forecasting** (timestamped predictions, multi-hour horizons), **visualization** (map-based UI, satellite overlay), and **access control** (JWT, roles). Comparing against agricultural or industrial case studies (e.g., instrumented research platforms with dense telemetry [8]) clarifies what is **absent** here—continuous physical sensing—and motivates future work.

Process-based versus data-driven modeling debates in other domains mirror our design: mechanistic or rule-based components provide **interpretability**, while learned residuals adapt to systematic errors when trustworthy labels exist [8]. Because our labels are partially synthetic, the **epistemic status** of the residual layer must be communicated clearly to users and reviewers.

---

## 3. Methodology

### 3.1 Overall approach

We followed an **iterative design–build–evaluate** cycle typical of software engineering capstone or research-implementation projects:

1. **Requirements and domain modeling** from parking regulations, campus geography, and stakeholder assumptions (staff/student presence documents).  
2. **Data modeling** for lots, spots, buildings, distances, schedules, and historical proxies.  
3. **Algorithm design** for occupancy prediction, eligibility, recommendations, and day-long “arrival plans.”  
4. **Implementation** as a monorepo with explicit OpenAPI specification (`BE/openapi.yaml`).  
5. **Validation** through unit tests on selected modules, manual scenario testing, and documented limitations (synthetic history, no live sensors).

This aligns with treating the artifact as an **experience report** and **proof-of-concept twin** rather than a randomized controlled trial of commuter behavior.

### 3.2 Information sources

- **Static geometry:** SVG exports from Figma (see `docs/figma.md`) parsed into relational spot records with labels, sections, rows, accessibility flags, and exit-distance attributes used in ranking.  
- **Topology:** Lot–building distances and path assumptions documented in project materials (e.g., campus path mapping figures).  
- **Academic structure:** Scraped course catalog (`BE/data/scraped-courses.json` pipeline via `scrape-courses.ts`) linking students to meetings, buildings, and enrollment counts.  
- **Behavioral parameters:** Carpool rate, non-driver rate, absence multipliers, and related values seeded into `campus_parameters` and described in staff/student presence assumption documents.  
- **Historical layer:** `historical_proxy_data` and residual tables (`lot_occupancy_corrections`) supporting data-driven correction—currently populated substantially from **synthetic** generators in development scripts.

### 3.3 Architecture

The system follows a **three-tier pattern** analogous to common web-based twin architectures:

1. **Client tier:** React SPA with Tailwind, Leaflet maps, authentication, prediction consumers, what-if UI, and day plan views.  
2. **Application tier:** Express REST API, JWT auth, modular services (prediction, recommendation, simulator, Earth Engine proxy).  
3. **Data tier:** SQLite locally, PostgreSQL (e.g., Supabase) in production configuration; optional Redis for response caching.

**Figure references (project artifacts — insert as numbered figures in the submission):**

| ID | File (repository) | Suggested caption |
|----|-------------------|-------------------|
| Fig. 1 | `docs/diagrams/SystemDesignDiagramDTProject.png` | System design and major subsystems of the parking digital twin. |
| Fig. 2 | `docs/diagrams/DTprojDataModelling.png` | Entity-relationship / data modelling view of core persistence. |
| Fig. 3 | `docs/dataModellingMarkup.mmd` (render to figure) | Mermaid source for ER diagram; use for reproducible diagram updates. |
| Fig. 4 | `docs/diagrams/feedback-loop.png` | Conceptual feedback between users, predictions, and campus state (simulated or future live). |
| Fig. 5 | `docs/diagrams/userScenarios.jpg` | User scenarios and interaction overview. |
| Fig. 6 | `docs/CampusPathMapping.png` | Campus paths supporting walk-time estimation. |
| Fig. 7 | `docs/MappedRoutesClear.png` | Mapped routes between lots and buildings. |
| Fig. 8 | `docs/gnattSchedule.png` | Project timeline / planning (development methodology visualization). |

*Slides:* `docs/ParkingDigitalTwin_Updated_Presentation.pptx` and `docs/CS4555.pptx` contain narrative material suitable for converting into introduction and methodology figures.

### 3.4 Runtime simulation modes

The backend hosts an **in-process simulator** with a short tick interval that perturbs spot occupancy according to a campus hourly profile with stochasticity, quiet hours, and a minimum occupancy floor. Two modes matter for methodology:

- **Live mode:** Wall-clock-driven simulation for demonstrations.  
- **Scenario mode:** A user-selected timestamp freezes the *declared* scenario clock for prediction-backed views; note that ongoing simulator churn can still affect spot-level state unless snapshot isolation is added—documented as a known limitation in internal reviews.

### 3.5 Engineering methodology and quality practices

Development followed **contract-first** API design via OpenAPI, **type-safe** shared language choices (TypeScript on both tiers), and **modular** backend boundaries (entities, services, controllers, routes). Selected utilities and eligibility rules are covered by automated tests; critical numerical pipelines remain under-tested—a common gap in student-led systems that should be foregrounded in academic reporting for reproducibility.

Deployment documentation in the repository README distinguishes **local** SQLite development from **production** PostgreSQL on Fly.io with optional Redis and Vercel-hosted frontend, including environment variables for Earth Engine and CORS. This split is methodologically important: empirical behavior of SQL dialects and connection pooling can diverge, so claims about performance or correctness should specify the runtime configuration used during experiments.

### 3.6 Ethics, privacy, and institutional context

Schedule-linked features imply **handling of enrollment and building locations** tied to identifiable students when personal accounts are used. Even without publishing individual records, the twin could enable inference about movement patterns if logs were retained indiscriminately. A publication should state **what data categories exist**, **retention posture**, and **access control** (role-based JWT claims in this system). Broader FERPA or Canadian privacy-policy alignment is outside the scope of the code artifact but appropriate for a full thesis or ethics review section.

---

## 4. Prediction, Recommendation, and What-If Analysis

### 4.1 Hybrid prediction stack

Lot-level occupancy (percentage) at an arbitrary date-time is computed through a **stacked pipeline** (see implementation review script `scripts/generate_report.py` for the authoritative layer list):

1. **Historical proxy:** If sufficient samples exist for (lot, hour, day-of-week, academic period), use their average.  
2. **Type curves:** Otherwise apply hard-coded 24-hour curves by lot type.  
3. **Residual correction:** Apply stored residuals (observed minus predicted) with weight scaling (e.g., `tanh(nSamples/10)`).  
4. **Activity curve:** Scale demand using enrollment-aware activity indices; lots near “hot” buildings receive higher weight.  
5. **Event boost:** Optional query-parameter scaling for small/medium/large events applied to remaining capacity.

Outputs are clamped to [0, 100]%. Academic-calendar multipliers distinguish classes, reading week, exams, holidays, pre-semester, and summer. **Confidence** is exposed in a coarse form (`data` vs `curve`), which future work could refine into graded uncertainty.

**Residual weighting.** Let \(n\) denote the number of historical samples contributing to a residual estimate for a given stratification (e.g., lot, hour, day-of-week, academic period). The implementation weights corrections using a saturating function of the form \(\tanh(n / 10)\), so that sparse evidence contributes gently while richer sample counts approach full correction strength. This is a pragmatic regularizer against noisy strata; documenting it satisfies reproducibility expectations in modeling papers.

**Activity and enrollment.** The activity curve service translates course enrollments and building associations into **demand indices** that redistribute predicted pressure across lots—not uniformly, but according to which lots are plausible for traffic destined to particular academic hubs. Combined with `getDemandMultiplier(dayOfWeek)` and parameters such as carpool rate, non-driver rate, and absence multipliers (including Friday/Monday adjustments), the engine encodes a **simple behavioral model** of how many commuters likely generate parking demand on a typical day.

**Event scaling.** Event size parameters apply proportional boosts to **remaining** free capacity rather than raw percentage points in isolation, which avoids trivially saturating small lots when baseline occupancy is already high. Reporting this distinction matters when comparing to naive “+X%” policies in operations literature.

### 4.2 Eligibility and recommendations

JWT claims carry **roles** (staff, student, PhD candidate) and flags (resident, disabled). Eligibility rules filter which lots appear in recommendations. The engine scores alternatives using predicted occupancy, distance to destination buildings, floor-aware walking assumptions where implemented, and spot attributes (e.g., accessible stalls).

### 4.3 Day-long arrival planning

For a chosen day, the service segments the student’s schedule into **initial arrival**, **stay on campus**, and **return and park** intervals. Each segment calls the prediction API and recommendation engine, records suggested lot/spot and walk time, and associates **scenario timestamps** so the UI can drive the map to the corresponding moment—linking **temporal planning** with **spatial visualization**.

### 4.4 What-if explorer

The what-if module compares a **baseline** snapshot to a **parameterized scenario** (event size, enrollment toggles, etc.), surfacing per-lot deltas and warnings (e.g., critically low remaining capacity). Results are short-lived cached to protect the database under load.

### 4.5 Earth Engine integration

Satellite basemaps are obtained by proxying Google Earth Engine endpoints from the backend so credentials do not ship to the browser; graceful fallback to OpenStreetMap occurs when credentials are absent.

### 4.6 API surface and reproducibility

Key read endpoints include single-lot prediction, day profiles, next- \(N\)-hours forecasts, and global snapshots at a timestamp. Clients pass datetime and scenario parameters consistently so that **figures in a paper** can cite exact API calls used to generate screenshots. Storing those calls (or HAR captures) as supplementary material would strengthen an empirical submission even before live sensors exist.

### 4.7 Demonstration scenarios (qualitative outcomes)

Although quantitative field validation is pending, the implemented system supports **repeatable demonstration narratives** useful for workshops, thesis defenses, and stakeholder meetings:

- **Morning peak:** A student with back-to-back classes in a high-enrollment building requests a day plan; the UI highlights predicted congestion in adjacent general lots and suggests alternatives with comparable walk times and higher modeled availability.  
- **Event surge:** Facilities staff configure a medium or large event boost and run the what-if explorer; the campus-wide table shows which lots lose free capacity fastest, supporting traffic-management conversations.  
- **Accessibility:** A user flagged for disability access triggers filtering toward stalls marked accessible and paths consistent with documented distance assumptions.  
- **Staff versus student:** Role-based eligibility prevents illegal recommendations (e.g., student accounts not routed into restricted staff lots) while still exposing predictions for situational awareness where policy allows.

These scenarios are **not** claims of measured commuter compliance; they illustrate **functional completeness** of the twin as a decision-support shell. Capturing screen recordings with timestamps and API parameters would produce compelling supplementary video for publication packages.

---

## 5. Digital Twin Characterization Tables

### 5.1 Oakes et al. fourteen-characteristic description framework

Oakes et al. propose fourteen characteristics (C1–C14) to clarify the scope, data flows, usages, and fidelity of a digital twin in experience reports [3]. Table 1 maps each characteristic to this project.

**Table 1 — Mapping to Oakes et al. (C1–C14) [3]**

| ID | Characteristic | How this project addresses it |
|----|----------------|------------------------------|
| C1 | **System-under-study** | UNB Saint John parking estate: lots, stalls, walkways, buildings, and agents (drivers, pedestrians). Environment includes academic calendar and event context. |
| C2 | **Acting components** | No physical actuators (gates, signs, pricing) are controlled. Acting is **cognitive/organizational**: UI recommendations and plans influence human decisions only. |
| C3 | **Sensing components** | **No deployed IoT** to stalls in the reported implementation. Occupancy changes are **simulated** or derived from internal logs, not automatic physical sensing. |
| C4 | **Multiplicities** | One logical twin instance serves many users; **sixteen lots** and **~1,230 spots** as sub-entities; multiple concurrent UI sessions. |
| C5 | **Data transmitted (SUS → DT)** | **Manual/batch:** course scrape, assumption documents, SVG map updates. **Automatic:** simulator ticks, API requests, optional Redis caching. **Not** continuous real-world occupancy telemetry. |
| C6 | **Insights and actions (DT → SUS)** | **Insights:** predictions, maps, what-if deltas, walk-time estimates. **Actions:** none executed automatically on physical infrastructure; users may change behavior. |
| C7 | **Usages** | Operational planning for individuals, exploratory analysis for events, demonstration of hybrid modeling for research/education. |
| C8 | **Enablers** | REST API, DB, prediction and recommendation services, simulator, GEE proxy, frontend visualization and auth. |
| C9 | **Models and data** | Hybrid models (curves + residuals + activity index + calendar); relational data; scraped JSON catalog; synthetic historical proxies. |
| C10 | **Constellation** | Composed services (prediction ↔ recommendation ↔ planning ↔ map UI); OpenAPI documents the public interface. |
| C11 | **Time-scale** | Predictions at arbitrary timestamps; simulator near–real-time tick; scraping and batch jobs slower than real-time. |
| C12 | **Fidelity considerations** | Geometric fidelity relatively high at stall level; **behavioral and occupancy fidelity limited** by synthetic history and lack of sensors. |
| C13 | **Life-cycle stages** | Focus on **operation** of campus parking; software **evolution** ongoing (migrations, testing, live data remain future work). |
| C14 | **Evolution** | Iterative addition of what-if planning, Earth Engine, residual tables, course pipeline; documented technical debt (calendar hardcoding, `synchronize: true`, etc.). |

Under Kritzinger et al. [5], the current deployment functions primarily as a **digital model** progressing toward a **shadow** once trustworthy automatic ingestion from the physical campus exists.

**Narrative walk-through of diagrams.** For the camera-ready paper, we recommend placing Fig. 1 (system design) immediately after the architecture subsection: it orients readers before micro-level entities. Fig. 2 (data modelling) should accompany Section 3.2 or Section 4 to show how prediction inputs relate to tables. Fig. 4 (feedback loop) supports Section 5’s discussion of C5–C6 (data and actions). User scenario artwork (Fig. 5) belongs near Section 4.3–4.4 to illustrate planning and what-if tasks. Path and route figures (Figs. 6–7) justify walk-time assumptions in recommendation scoring. The Gantt-style schedule figure (Fig. 8) is optional in a technical venue but appropriate for a capstone or project-management appendix.

### 5.2 Twenty-one-item systematic reporting framework (Gil et al.)

Gil et al. synthesize **twenty-one** reporting characteristics by merging multiple literature-derived frameworks and illustrate them on cooperative robotics and additional case studies [4]. The fourteen rows in Table 1 are the **core Oakes description framework**; Gil et al. add further **fine-grained reporting prompts** so that experience reports remain comparable across communities.

**Important:** Before camera-ready submission, replace Table 2’s paraphrased rows (R15–R21) with the **exact labels and definitions** from your copy of Gil et al. (2024). The rows below are **placeholders** capturing typical cross-cutting themes in unified reporting frameworks (uncertainty, governance, interoperability, validation, security, scalability, and project lessons) so your draft has the correct **row count** and structure for advisor review.

**How to finalize the twenty-one-item table.** Obtain the authoritative wording from Gil et al. (2024)—typically presented as a consolidated checklist merging systematic-mapping, experience-report, and literature-review dimensions. For each item \(i \in \{1,\ldots,21\}\), add a column **Evidence in this project** (short phrase) and optionally **Maturity (low/med/high)**. If your professor’s rubric maps one-to-one to C1–C14 plus seven extensions, you may **merge** Table 1 and Table 2 into a single table after reconciling numbering. Keep Oakes et al.’s definitions for C1–C14 verbatim in footnotes the first time they appear to avoid conceptual drift.

**Table 2 — Extended reporting dimensions (R15–R21) — *verify against Gil et al. [4]***

| ID | Dimension (placeholder label) | Project note |
|----|--------------------------------|--------------|
| R15 | Uncertainty & confidence | Coarse `data`/`curve` flag; no full posterior or ensemble variance yet. |
| R16 | Validation & verification (V&V) | Partial unit tests; no field study against ground-truth occupancy. |
| R17 | Data governance & provenance | Scraped catalog and synthetic history require lineage documentation for production. |
| R18 | Interoperability & standards | OpenAPI; standard web stack; potential AAS or campus IDS alignment future work. |
| R19 | Security & privacy | JWT auth, password hashing; FERPA/privacy review needed for schedule features at scale. |
| R20 | Scalability & operations | Redis caching; production Postgres; risks from `synchronize: true` and cache bypass under failure. |
| R21 | Cost, effort, lessons learned | Monorepo reduced friction; scraper fragility and synthetic data identified as top risks. |

---

## 6. Discussion, Limitations, and Future Work

Internal implementation review (`scripts/generate_report.py`) already catalogs risks; we summarize the **research-relevant** points:

1. **Synthetic historical data** can align with the same curves the model uses, limiting independent validation of the residual layer.  
2. **No real occupancy sensors** implies the “twin” is not observationally locked to the physical campus.  
3. **Course scraping** depends on portal HTML and credentials; brittle under vendor updates.  
4. **Academic calendar** hardcoding expires unless replaced with data-driven configuration.  
5. **Testing gaps** on prediction core, simulator determinism in scenario mode, and what-if service layering.  
6. **Operational** concerns: Redis silent disable, Earth Engine credential expiry without UI signaling.

### 6.1 Threats to validity

**Construct validity:** Occupancy “ground truth” in demonstrations is simulated; metrics such as mean absolute error against real counts are not yet meaningful.  
**Internal validity:** Layered predictors interact; ablation studies (disabling residuals, events, or activity curves) should be run on a frozen evaluation harness once real data exists.  
**External validity:** UNB Saint John’s geography, regulations, and commuter mix may not transfer directly to other institutions; however, the **software architecture** and reporting framework mapping generalize as a template.

### 6.2 Comparison to alternative approaches

A purely **machine-learning** forecaster might achieve lower error given dense labels but sacrifice explainability for facilities managers. A purely **rule-based** system would be transparent but inflexible across semesters. The **hybrid** approach trades off interpretable baselines (curves, calendar) with adaptive residuals—sensible when labels are initially weak. **Agent-based microsimulation** of vehicles could add fidelity at substantial implementation cost; our spot-level simulator is lighter-weight and suitable for interactive demos.

### 6.3 Suggested evaluation protocol (future empirical phase)

When pilot data become available, we suggest: (i) stratified hold-out weeks by academic period; (ii) calibration of curve families per lot type; (iii) reporting CRPS or pinball loss for probabilistic extensions; (iv) user-centric metrics such as success rate of finding parking within a time budget under recommendation policy vs baseline choices. Pre-registration of hypotheses would strengthen publication merit.

**Future work:** integrate pilot counts or camera/loop-sensor data; migrate schema with TypeORM migrations; expand probabilistic outputs; snapshot isolation for scenarios; administrative parameter APIs; rigorous evaluation against manual or sensor ground truth.

---

## 7. Conclusion

We presented a campus parking digital twin for UNB Saint John that unifies geometric lot models, schedule-aware hybrid prediction, scenario analysis, and personalized arrival planning in a modern web stack. The work is characterized candidly against Oakes et al.’s fourteen dimensions and situated with respect to Gil et al.’s twenty-one-item reporting agenda. The primary scientific gap is **empirical coupling** to physical occupancy; addressing it would advance the system from a decision-support **model** toward a **digital shadow** or **twin** in the strict sense.

For **publication planning**, authors should (i) replace placeholder author metadata and verify Gil et al.’s characteristic labels; (ii) export diagrams from `docs/diagrams/` at print resolution; (iii) capture a frozen software tag (git commit) in the data availability statement; and (iv) align references with the target venue’s BibTeX style (ACM, IEEE, Springer, etc.). If the venue expects a **6-page short paper**, compress Sections 4–6; if it expects **~4,500 words**, retain depth in methodology, characterization, and threats to validity.

---

## Acknowledgments

[Funding, supervisory faculty, UNB facilities or IT contacts, peer reviewers, and open-source maintainers of Leaflet, TypeORM, Express, React, and Google Earth Engine—complete as appropriate.]

---

## References (starter set — expand per venue style)

[1] A. Madni, C. Madni, and J. Lucero, “Leveraging digital twin technology in model-based systems engineering,” *Systems*, 2019.  
[2] M. Grieves and J. Vickers, “Digital twin: Mitigating unpredictable, undesirable emergent behavior in complex systems,” in *Transdisciplinary Perspectives on Complex Systems*, Springer, 2017.  
[3] B. J. Oakes et al., “A Digital Twin Description Framework and its Mapping to Asset Administration Shell,” arXiv:2209.12661, 2023 (Springer LNCS version available via DOI 10.1007/978-3-031-38821-7_1).  
[4] S. Gil, B. J. Oakes, et al., *Towards a Systematic Reporting Framework for Digital Twins: A Cooperative Robotics Case Study*, 2024 — **use the exact venue pages/DIO from your PDF for the full twenty-one-characteristic table.**  
[5] W. Kritzinger, M. Karner, G. Traar, J. Henjes, and W. Sihn, “Digital Twin in manufacturing: A categorical literature review and classification,” *IFAC-PapersOnLine*, 2018.  
[6] C. Pylianidis, S. Osinga, and I. N. Athanasiadis, “Introducing digital twins to agriculture,” *Computers and Electronics in Agriculture*, 2021.  
[7] J. Siddorn et al., “An Information Management Framework for Environmental Digital Twins (IMFe),” Zenodo, 2022. (Conceptual layers: collection through security.)  
[8] I. Fakeye et al., “Towards A Framework For Farm-scale Digital Twins,” in *Proc. MODELS Companion ’24*, ACM, 2024. https://doi.org/10.1145/3652620.3688264 — **structural** reference for methodology, layered architecture, and PBM/DDM interaction tables in a short research article (matches the excerpted template PDF in the course materials).

---

## Appendix A — CCS Concepts and ACM-style metadata (optional)

If submitting to ACM:  
**CCS:** Human-centered computing → Interactive maps; Applied computing → Education; Computing methodologies → Modeling and simulation.  

**Word count note:** Paste sections into your word processor; expand Section 4 with equations or pseudocode, and Section 6 with a small user study outline, to reach the instructor’s ~4,500-word target if needed.

## Appendix B — Implementation stack summary

Table 3 condenses the repository’s stated technology choices for quick replication (see also `README.md` and `scripts/generate_report.py`).

**Table 3 — Major implementation technologies**

| Layer | Technology | Role |
|-------|------------|------|
| Backend runtime | Node.js 20, Express 4 | REST API, middleware, simulator host |
| Language | TypeScript | Shared typing discipline across tiers |
| ORM / databases | TypeORM; SQLite (dev), PostgreSQL (prod) | Persistence for lots, spots, logs, schedules, parameters |
| Frontend | React 18, Vite 5, TailwindCSS | SPA, dashboards, maps |
| Mapping | Leaflet 1.9, react-leaflet | Interactive campus visualization |
| Caching | Redis (optional) | TTL caching for heavy read paths |
| Imagery | Google Earth Engine (proxied) | Satellite basemap |
| Auth | JWT, bcrypt | Stateless sessions, role claims |
| Testing | Jest (backend), Vitest (frontend) | Partial automated coverage |
| Contract | OpenAPI 3.0.3 | Machine-readable API specification |
