# Diet Tracker Health Review and Implementation Handoff

## Purpose and repository state

This document records the requests, decisions, evidence, implementation, validation, and deployments completed in the session ending 27 July 2026. The application is a single-file Arabic RTL Firebase app in `public/index.html`.

The session also created `AGENTS.md` as a 383-word contributor guide. It was confirmed absent before creation and was not replacing an existing file.

## User prompts

The health-review request was:

> review the content of the Diet plan and calories intakes, protient/carbs/fat shares. And the instructions and everything related to the health and diet in this app. Hing: the content is written in Arabic.  
> Let me know if you need any additional info or answers to some questions.

After receiving the audit and proposed implementation plan, the user requested:

> Implement the plan.

The user subsequently requested deployment, supplied a live-page text dump for verification, and asked that the intended changes be ensured.

Earlier in the session, the user also requested an `AGENTS.md` contributor guide with project structure, commands, style, tests, and contribution conventions. The repository had no Git history, package manifest, test framework, formatter, or linter.

## Questions asked and answers received

### Review scope

- **Review type?** Both general-app safety and personal-plan suitability.
- **Intended audience?** One adult.
- **Deliverable?** Findings plus a fix plan.

### Initial profile clarification

- **Did the embedded 90→80 kg male/goalkeeper/meniscus profile match?** No; it was a template.
- **Any health factors affecting advice?** One or more applied.
- **Knee status?** Initially selected “clinician-cleared plan,” then clarified that the injury was clinically confirmed and physical therapy had been completed, but the exact plan had not been physician-cleared.

### Final personal information

- Age: 29
- Sex: male
- Height: 186 cm
- Current weight: 105.5 kg
- Target: 86 kg, or an evidence-based alternative
- Desired pace: fastest possible without harming health or losing muscle
- Training: four resistance/hypertrophy sessions weekly, with approximately three 20-minute treadmill walks at speed ~5 km/h
- Known condition: chronically low blood pressure, approximately 80–90/40–60 mmHg
- Symptoms: occasional mild symptoms
- Clinical status: low pressure evaluated as a benign baseline
- Knee: clinically confirmed injury; prior physical therapy; exact gym/football plan not cleared
- Supplements: none; willing to use useful/necessary supplements

## Main findings before implementation

1. **The calorie calculator and fixed menu contradicted each other.** For the reviewed profile at activity factor 1.55, Mifflin–St Jeor estimated BMR at 2,077.5 kcal and TDEE at ~3,220 kcal. The old five-meal menu supplied only 1,540–1,680 kcal.
2. **Exercise was double counted.** TDEE already used an activity multiplier, but the summary subtracted fixed workout calories again as “net calories.”
3. **Protein targets were based on current weight even during fat loss.** This produced 169–232 g for 105.5 kg and an unnecessarily broad upper target.
4. **Macro distribution could become unbalanced.** Old menu combinations ranged from 28–64 g fat and 108–170 g carbohydrate, while protein contributed up to ~42% of displayed calories.
5. **Some food calories did not reconcile with macros.** Individual discrepancies reached 41 kcal in default meals. User-created entries could be much worse.
6. **The app accepted ages 10–100 while using adult formulas and adult weight-loss advice.**
7. **The fixed 4 L plain-water target was not individualized** and confused plain water with total water from food and beverages.
8. **Knee claims were overconfident**, including “completely safe,” “safest for the meniscus,” fixed pain permission, universal exercise bans, and a knee sleeve framed as protection.
9. **Supplement copy acted like a prescription.** It recommended brands/stores, automatic vitamin D/omega-3 dosing, doubled omega-3 “for joints,” and routine ashwagandha without adequate contraindications.
10. **Several behavioral claims were too absolute:** immediate post-workout protein, breakfast within one hour, fixed 8,000 steps, mandatory diet breaks “for hormones,” fixed maintenance of 2,700 kcal, and injury claims tied to sleep.
11. **AI-created nutrition estimates had no strong warning or reconciliation check.**
12. **The post-deployment screen still showed legacy Firestore targets** (`1950–2050 kcal`, `169–232 g protein`) because stored settings correctly survived a hosting deployment but had not been migrated.

## Calculation changes

| Area | Old | New | Reason |
|---|---|---|---|
| Reviewed BMR | Not surfaced as a fixture | 2,078 kcal | Mifflin–St Jeor for 29/M/186/105.5 |
| Reviewed TDEE | Stored screen showed a target consistent with low activity | ~3,220 kcal at activity 1.55 | Four resistance sessions fit the app’s 3–5 day activity band; still an estimate requiring trend calibration |
| Calorie target | Live legacy `1950–2050`; formula fixture previously gave `2600±50` depending profile | `2550–2650` | ~20% deficit, expected ~0.56 kg/week before adaptation |
| Protein formula | `1.6–2.2 × current weight` | `2.0–2.2 × target weight` during loss | Produces a narrower muscle-retention target without inflating requirements from excess body mass |
| Reviewed protein | `169–232 g` | `172–189 g` | Based on 86 kg goal weight |
| Fat guidance | 25–35% of calories | 25–30% preferred band | Avoided an excessively wide residual carbohydrate range |
| Reviewed fat | Screen showed `56–67 g` from old targets | Approximately `72–87 g` | Based on reviewed calorie target |
| Reviewed carbohydrate | Screen showed `149–174 g` | Approximately `274–308 g` | Residual after protein and fat; supports resistance training. The low end is the residual at maximum fat and the high end the residual at minimum fat, so the fat and carbohydrate ranges cannot both be maxed at once |
| Weight-loss adjustment | Fixed prediction and two-week plateau rule | Use a three-week average; retain at 0.4–0.8 kg/week, add 100–200 kcal if too fast/symptomatic, reduce 100–150 only if too slow for three weeks | Reduces reactions to water-weight noise and protects performance |
| Goal weight | Unqualified number | 86 kg retained as an initial milestone; BMI ≈24.9 and must be interpreted with waist, strength, and body composition | BMI is a screening tool, not a complete health assessment |

The projection still remains explicitly labeled an estimate. A realistic 86 kg timeline was assessed as roughly 7–10 months, including adaptation and adjustment periods.

## Default meal changes

All listed weights for meat, fish, rice, and potatoes are now explicitly cooked weights. Oil is specified in grams. Calories and macros are estimates; product labels and weighed recipes take priority.

### Breakfast

| Old | New |
|---|---|
| 3 eggs + 2 toast: 380 kcal, P26/F17/C31 | 3 eggs + 3 toast: 454 kcal, P29/F18/C44 |
| 200 g cottage cheese + 2 toast + tsp oil: 380, P28/F15/C32 | 250 g + 3 toast + tsp oil: 478, P37/F16/C47 |
| 50 g oats + 250 ml milk + ½ whey: 365, P27/F7/C48 | 70 g oats + 300 ml milk + ½ whey: 484, P32/F12/C62 |
| 5 tbsp ful + 2 eggs + 1 toast: 380, P27/F11/C42 | 7 tbsp ful + 3 eggs + 1 toast: 508, P35/F20/C47 |

### Snack

| Old | New |
|---|---|
| 170 g Greek yogurt + apple: 195, P18/F1/C31 | Added 10 g almonds: 266, P20/F6/C33 |
| 200 g low-fat yogurt + 10 g almonds: 185, P13/F7/C17 | Almonds increased to 20 g: 249, P15/F13/C18 |
| 100 g cottage cheese + toast: 175, P14/F5/C17 | Cottage cheese increased to 150 g: 210, P20/F6/C19 |
| 250 ml milk + 15 g peanuts: 200, P12/F10/C16 | Peanuts increased to 25 g: 273, P14/F17/C16 |

### Lunch

| Old | New |
|---|---|
| 200 g chicken + 200 g rice + salad/tsp oil: 665, P67/F12/C62 | 200 g chicken + 300 g rice + salad + 10 g oil: 792, P68/F16/C94 |
| 220 g fish + 300 g potato + salad/tsp oil: 620, P63/F13/C66 | 220 g fish + 400 g potato + salad + 10 g oil: 748, P61/F16/C90 |
| 200 g lean beef + 175 g rice + vegetables: 635, P59/F17/C55 | 200 g beef + 250 g rice + vegetables: 778, P64/F18/C90 |

### Training-adjacent meal

The heading changed from “after training” to “meal near training,” with guidance that it may be eaten within 2–3 hours before or after training.

| Old | New |
|---|---|
| Whey with water: 120, P24/F2/C3 | Whey + banana: 222, P25/F2/C26 |
| Tuna only: 120, P26/F1/C0 | Tuna + toast: 186, P29/F2/C13 |
| 150 g cottage cheese: 135, P17/F5/C4 | 200 g cottage cheese + apple: 254, P22/F6/C28 |
| 200 g Greek yogurt: 130, P20/F1/C7 | 250 g Greek yogurt + banana: 246, P25/F2/C32 |

### Dinner

| Old | New |
|---|---|
| 250 g cottage cheese + salad + tsp oil: 300, P29/F15/C11 | Added 2 toast: 446, P35/F14/C45 |
| 2 eggs + 100 g cottage cheese + vegetables: 260, P25/F14/C6 | 3 eggs + 150 g cottage cheese + vegetables + toast: 465, P38/F21/C31 |
| Tuna + toast + salad/tsp oil: 265, P30/F7/C18 | Tuna + 250 g potato + 2 toast + salad/tsp oil: 512, P37/F8/C73 |
| 250 g Greek yogurt + cucumber + 15 g almonds: 265, P28/F9/C14 | 250 g yogurt + 30 g almonds + 40 g oats: 488, P36/F20/C41 |

### Extras and small reference corrections

| Old | New |
|---|---|
| Banana 90 kcal | 96 kcal, P1/F0/C23 |
| Small baladi bread 170 | 173, P6/F1/C35 |
| Extra cooked rice 50 g / 65 kcal | 150 g / 183 kcal, P3/F1/C41 |
| Extra oil described as a tablespoon / 120 | Explicit 14 g / 126 |
| 7 g honey 25 | 24 |
| 21 g honey 65 | 68 |
| No complete energy module | Added banana + 40 g oats + 250 ml milk: 370, P15/F7/C62 |
| Plain coffee 5 | 4, matching 1 g carbohydrate |
| 5 g oil reference 40 | 45, matching 5 g fat |

The core menu now spans approximately 2,040–2,340 kcal and 161–192 g protein before extras. Extras are intentionally required to close the remaining gap according to the displayed target. Exhaustive enumeration found **12,251** default-meal-plus-extra combinations satisfying 2,550–2,650 kcal, 172–189 g protein, 72–87 g fat, and the carbohydrate band the app actually displays, 274–308 g. (Enumeration covers the five core meal slots — breakfast, snack, lunch, pre-workout, dinner — with any subset of the nine weighed extras; the two optional drink slots are excluded. Under the narrower 253–300 g band used in an earlier draft the same enumeration yields 10,668.)

## Display, validation, and data changes

| Old behavior | New behavior | Reason |
|---|---|---|
| Displayed fixed workout burn and “net calories” | Both removed | Activity was already included in TDEE; subtraction double counted exercise |
| Fixed 16 cups / 4 L target | Counter says “recorded fluids”; guidance states needs vary and food/beverages count | Total-water needs are individualized |
| Age accepted 10–100 | Adults only, 18–100 | Adult formulas and advice are inappropriate for children |
| Goal weight accepted 30–300 kg without height check | Goal BMI must be 18.5–40 or require specialist review | Prevents extreme automated goals |
| Manual calories/protein unrestricted | Calories 1,200–6,000; protein 40–300; lower bound must not exceed upper bound | Basic input safety |
| Custom AI foods silently trusted | AI is labeled approximate; entries >10% different from `4P + 9F + 4C` show an orange warning | Prevents false precision and catches inconsistent saved entries |
| Default data had no global reconciliation assertion | All 73 default/reference foods must reconcile within 10% | Allows label rounding/fiber variance while catching major errors |
| Existing synced targets stayed legacy | One-time `REVIEWED_PROFILE_VERSION=2` migration detects the reviewed 29/M/186/~105.5/86 profile, sets activity 1.55 and reviewed targets, then syncs | Hosting deployments do not and should not overwrite Firestore user settings |

The migration preserves custom foods and only runs once for the matching reviewed profile. Later manual target edits remain respected.

Two pasted custom entries were specifically identified for review:

- Greek yogurt + Protein Puffs: displayed 323 kcal, but P24/F1/C20.7 yields ~188 kcal.
- A 90 kcal yogurt with P15/F3/C8 yields ~119 kcal.

No value was automatically “corrected” because the source label/serving is required to know whether calories or macros are wrong.

## Health and Arabic-copy changes

### Hydration and hypotension

- **Old:** mandatory 4 L/day and 16 cups.
- **New:** individualized total-fluid guidance based on heat, sweat, activity, food, and beverages.
- Added: symptom logging; stop and sit/lie down for dizziness, blurred vision, or nausea; urgent evaluation for fainting, confusion, chest pain, dyspnea, or rapid/irregular pulse.
- Added: do not self-prescribe salt, fluid loading, or supplements as hypotension treatment.

### Knee and exercise

- **Old:** Push/Pull “completely safe,” bike “safest,” 2–3/10 pain automatically acceptable, universal bans on leg extension/deep squats, sleeve presented as protection, goalkeeper calories fixed at 300–400.
- **New:** no exercise is guaranteed safe; exact range/load/return-to-football plan must be reviewed by an orthopedist or sports physiotherapist.
- Added red flags: locking, swelling, giving way, sharp pain, or worse symptoms the next day.
- Knee sleeve may provide comfort but is not injury prevention.
- Running, jumping, and direction changes are delayed until return-to-sport criteria are set.
- Four resistance sessions are retained if symptoms and recovery remain stable; treadmill work is not credited as extra food calories.

### Meal timing, oils, and food language

- **Old:** breakfast within one hour, snack immediately after training, rigid event-linked timing.
- **New:** flexible timing; distribute protein over 3–5 meals and place a protein/carbohydrate meal within 2–3 hours before or after training.
- **Old:** one oil spray equals ~5 kcal.
- **New:** sprays vary; weigh the bottle or oil in grams.
- “Forbidden” and “reward” language was removed from honey/nut guidance.
- Added minimum food-quality guidance: vegetables in two meals, two fruit servings, and at least 30 g fiber daily.
- Tuna is no longer presented as the default repeated emergency option; protein variety is encouraged.

### Supplements and caffeine

- **Old:** named brands and Egyptian stores; automatic combined omega-3/D3 product; one or two capsules “for joints”; whey immediately post-workout; ashwagandha 300–600 mg or 2–3 g powder; eight-week cycle.
- **New:** no brand/store endorsement and no automatic supplement prescription.
- Creatine monohydrate is optional at 3–5 g/day, without required loading, after checking renal/medication contraindications; possible 1–2 kg water-weight gain is explained.
- Whey is optional convenience food.
- Vitamin D is based on clinical/dietary assessment rather than automatic dosing.
- Omega-3 starts food-first; supplement dose is reviewed with a clinician/pharmacist, especially with anticoagulants.
- Ashwagandha is not routine; limited sleep benefit, thyroid/medication interactions, and rare liver injury are stated.
- Caffeine guidance now requires label milligrams, a maximum of 400 mg/day for most healthy adults, and avoidance when it worsens dizziness, palpitations, or sleep.

### Sleep, measurement, and diet breaks

- **Old:** 7–8 hours, hard 6.5-hour minimum, categorical injury claim below six hours.
- **New:** target 7–9 hours and adjust training to actual alertness/performance.
- InBody/BIA is explicitly an approximate trend tool requiring consistent conditions.
- Waist, weight, photos, and performance are used together rather than calling one measure the “truest.”
- Diet breaks are optional adherence tools, not mandatory hormone resets; maintenance is recalculated rather than fixed at 2,700 kcal.
- The progress page now states a 0.4–0.8 kg/week target after the first two weeks and uses a three-week trend.

## Sources used

Primary or authoritative sources were preferred:

1. [CDC — Steps for Losing Weight](https://www.cdc.gov/healthy-weight-growth/losing-weight/index.html): gradual loss of about 1–2 lb/week and the roles of diet, activity, sleep, and stress.
2. [CDC — Adult BMI Categories](https://www.cdc.gov/bmi/adult-calculator/bmi-categories.html): BMI 18.5–<25 healthy category and BMI as a screening measure.
3. [NIDDK — Body Weight Planner](https://www.niddk.nih.gov/bwp): individualized calorie/activity modeling and adult-only limitations.
4. [NIDDK — Eating and Physical Activity to Lose or Maintain Weight](https://www.niddk.nih.gov/health-information/weight-management/adult-overweight-obesity/eating-physical-activity): sustainable healthy eating patterns and metabolic adaptation.
5. [PubMed — Achieving an Optimal Fat Loss Phase in Resistance-Trained Athletes](https://pubmed.ncbi.nlm.nih.gov/34579132/): 0.5–1.0% body-weight loss/week, protein distribution, and creatine evidence.
6. [PubMed — Different Weight-Loss Rates in Elite Athletes](https://pubmed.ncbi.nlm.nih.gov/21558571/): slower loss better preserving lean mass/performance.
7. [ISSN protein position stand](https://pmc.ncbi.nlm.nih.gov/articles/PMC5477153/): higher protein needs during energy restriction and resistance training.
8. [National Academies — Macronutrient AMDR](https://nap.nationalacademies.org/skim.php?chap=936-967&record_id=10490): adult protein, fat, and carbohydrate distribution ranges.
9. [National Academies — Dietary Reference Intakes for Water](https://nap.nationalacademies.org/read/10925/chapter/2?term=acute): 3.7 L/day adequate intake for young men is total water from beverages and food.
10. [CDC — Water and Healthier Drinks](https://www.cdc.gov/healthy-weight-growth/water-healthy-drinks/index.html): needs vary with person, climate, and activity.
11. [NHS — Low Blood Pressure](https://www.nhs.uk/conditions/low-blood-pressure-hypotension/): <90/60 definition, symptoms, and when to seek evaluation.
12. [Mayo Clinic — Hypotension](https://www.mayoclinic.org/diseases-conditions/low-blood-pressure/symptoms-causes/syc-20355465): symptoms, causes, and emergency red flags.
13. [AAOS — Meniscus Tears](https://orthoinfo.aaos.org/en/diseases--conditions/meniscus-tears/): diagnosis, locking/swelling, individualized treatment, and rehabilitation.
14. [NIH ODS — Exercise and Athletic Performance Supplements](https://ods.od.nih.gov/factsheets/ExerciseAndAthleticPerformance-HealthProfessional/): creatine monohydrate evidence, 3–5 g/day maintenance, safety, and water-weight gain.
15. [NIH ODS — Vitamin D](https://ods.od.nih.gov/factsheets/Vitamind-HealthProfessional/): intake limits, toxicity, and testing context.
16. [NIH ODS — Omega-3 Fatty Acids](https://ods.od.nih.gov/factsheets/Omega3FattyAcids-HealthProfessional/): limited claims, bleeding considerations, and high-dose atrial-fibrillation signal.
17. [NCCIH — Ashwagandha Usefulness and Safety](https://www.nccih.nih.gov/health/ashwagandha): limited evidence, liver injury reports, thyroid and medication interactions.
18. [FDA — How Much Caffeine Is Too Much?](https://www.fda.gov/consumers/consumer-updates/spilling-beans-how-much-caffeine-too-much): 400 mg/day for most adults and sensitivity/condition caveats.
19. [U.S. Physical Activity Guidelines](https://odphp.health.gov/our-work/nutrition-physical-activity/physical-activity-guidelines/current-guidelines/top-10-things-know): 150–300 minutes moderate aerobic activity and at least two strength days for general health.

These sources support general guidance and do not replace individualized care.

## Validation performed

- Classic browser JavaScript parsed successfully with `new Function`.
- The reviewed fixture asserted:
  - BMR 2,077.5
  - TDEE 3,220
  - Calories 2,550–2,650
  - Protein 172–189 g
- All 73 built-in/reference foods reconciled with `4P + 9F + 4C` within 10%.
- Exhaustive meal enumeration found 12,251 valid reviewed-profile daily combinations against the displayed 274–308 g carbohydrate band (10,668 under the narrower 253–300 g band).
- Custom-warning fixtures correctly flagged the two inconsistent examples and did not flag a consistent yogurt example.
- Firebase Hosting successfully served the app locally.
- `firebase deploy --only firestore:rules --dry-run` compiled the unchanged Firestore rules successfully.

## Deployment history and current live state

Hosting was deployed twice during the session:

1. Initial health-content implementation.
2. One-time target migration and custom macro-warning implementation.

Both configured Firebase Hosting targets were successfully released and live responses were checked for the migration and warning code:

- <https://diet-tracker-372ca.web.app>
- <https://5asesny.web.app>

Firestore rules were not changed or deployed. The profile migration runs client-side on the next authenticated load and then syncs the updated settings to the existing `/trackers/{uid}` document. Custom foods and historical daily data are preserved.

## Review cautions for the next agent

- Verify the target migration actually ran after Ahmed refreshed while authenticated; hosting deployment alone cannot confirm private Firestore state.
- Do not silently “fix” custom food entries without package labels or weighed recipe data.
- The TDEE remains an estimate. Recalibrate against at least three weeks of accurately logged intake and average weight.
- Activity factor 1.55 was selected from the app’s existing bands because the stated routine is four resistance days plus limited cardio. A desk-heavy non-training day pattern may make real TDEE lower.
- The exact knee plan still requires professional clearance.
- Low blood pressure is reportedly clinician-assessed as benign, but worsening symptoms during energy restriction require reassessment.
- No automated end-to-end browser test framework exists; validation is static/arithmetic plus Firebase CLI checks.
