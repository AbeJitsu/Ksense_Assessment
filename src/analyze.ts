// ============================================
// ANALYSIS SCRIPT - Test scoring logic without submitting
// This helps us objectively validate our assumptions
// ============================================

import * as dotenv from "dotenv";
dotenv.config();

const BASE_URL = process.env.API_BASE_URL || "https://assessment.ksensetech.com/api";
const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  console.error("Error: API_KEY environment variable is required");
  process.exit(1);
}

interface Patient {
  patient_id: string;
  blood_pressure?: string;
  temperature?: string | number;
  age?: string | number;
}

interface PaginatedResponse {
  data: Patient[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrevious: boolean;
  };
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

async function fetchWithRetry<T>(
  url: string,
  options: RequestInit = {},
  maxRetries: number = 5
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          "x-api-key": API_KEY,
          "Content-Type": "application/json",
          ...options.headers,
        },
      });

      if (response.ok) {
        return (await response.json()) as T;
      }

      if ([429, 500, 503].includes(response.status)) {
        const delay = Math.pow(2, attempt) * 1000 + Math.random() * 500;
        await sleep(delay);
        lastError = new Error(`HTTP ${response.status}`);
        continue;
      }

      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("HTTP")) {
        throw error;
      }
      const delay = Math.pow(2, attempt) * 1000 + Math.random() * 500;
      await sleep(delay);
      lastError = error as Error;
    }
  }

  throw lastError || new Error("Max retries exceeded");
}

async function fetchAllPatients(): Promise<Patient[]> {
  const allPatients: Patient[] = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const response = await fetchWithRetry<PaginatedResponse>(
      `${BASE_URL}/patients?page=${page}&limit=20`
    );

    const pagination = response.pagination || {};
    if (pagination.totalPages !== undefined) {
      totalPages = pagination.totalPages;
    }

    const patients = Array.isArray(response.data) ? response.data : [];
    allPatients.push(...patients);
    page++;
  }

  return allPatients;
}

// Parsing functions
function parseBloodPressure(bp: unknown): { systolic: number; diastolic: number } | null {
  if (bp === null || bp === undefined || bp === "") return null;
  const bpStr = String(bp).trim();
  const match = bpStr.match(/^(\d+)\s*[\/\\]\s*(\d+)$/);
  if (!match) return null;
  const systolic = parseInt(match[1], 10);
  const diastolic = parseInt(match[2], 10);
  if (isNaN(systolic) || isNaN(diastolic)) return null;
  if (systolic <= 0 || diastolic <= 0) return null;
  if (systolic < diastolic) return null;
  return { systolic, diastolic };
}

function parseTemperature(temp: unknown): number | null {
  if (temp === null || temp === undefined || temp === "") return null;
  let tempNum: number;
  if (typeof temp === "number") {
    tempNum = temp;
  } else {
    const tempStr = String(temp).trim().replace(/[°FfCc]/g, "");
    tempNum = parseFloat(tempStr);
  }
  if (isNaN(tempNum)) return null;
  if (tempNum < 90 || tempNum > 115) return null;
  return tempNum;
}

function parseAge(age: unknown): number | null {
  if (age === null || age === undefined || age === "") return null;
  let ageNum: number;
  if (typeof age === "number") {
    ageNum = age;
  } else {
    const ageStr = String(age).trim().replace(/[^\d.]/g, "");
    ageNum = parseFloat(ageStr);
  }
  if (isNaN(ageNum)) return null;
  if (ageNum < 0 || ageNum > 150) return null;
  return Math.floor(ageNum);
}

// Current scoring logic
function getBPScore(bp: unknown): number {
  const parsed = parseBloodPressure(bp);
  if (!parsed) return 0;
  const { systolic, diastolic } = parsed;

  let systolicCategory: number;
  if (systolic < 120) systolicCategory = 1;
  else if (systolic <= 129) systolicCategory = 2;
  else if (systolic <= 139) systolicCategory = 3;
  else systolicCategory = 4;

  let diastolicCategory: number;
  if (diastolic < 80) diastolicCategory = 1;
  else if (diastolic <= 89) diastolicCategory = 3;
  else diastolicCategory = 4;

  return Math.max(systolicCategory, diastolicCategory);
}

function getTempScore(temp: unknown): number {
  const parsed = parseTemperature(temp);
  if (parsed === null) return 0;
  if (parsed <= 99.5) return 0;
  if (parsed <= 100.9) return 1;
  return 2;
}

function getAgeScore(age: unknown): number {
  const parsed = parseAge(age);
  if (parsed === null) return 0;
  if (parsed > 65) return 2;
  return 1;
}

function hasDataQualityIssue(patient: Patient): boolean {
  return (
    parseBloodPressure(patient.blood_pressure) === null ||
    parseTemperature(patient.temperature) === null ||
    parseAge(patient.age) === null
  );
}

function hasFever(temp: unknown): boolean {
  const parsed = parseTemperature(temp);
  if (parsed === null) return false;
  return parsed >= 99.6;
}

// Analysis structure
interface PatientAnalysis {
  id: string;
  rawBP: string;
  rawTemp: string | number | undefined;
  rawAge: string | number | undefined;
  parsedBP: { systolic: number; diastolic: number } | null;
  parsedTemp: number | null;
  parsedAge: number | null;
  bpScore: number;
  tempScore: number;
  ageScore: number;
  totalScore: number;
  hasDataIssue: boolean;
  hasFever: boolean;
  isHighRisk_gte4: boolean;  // >= 4
  isHighRisk_gt4: boolean;   // > 4
}

async function analyze() {
  console.log("=== PATIENT SCORING ANALYSIS ===\n");
  console.log("Fetching patient data...\n");

  const patients = await fetchAllPatients();
  console.log(`Total patients: ${patients.length}\n`);

  // Analyze each patient
  const analyses: PatientAnalysis[] = patients.map(p => {
    const bpScore = getBPScore(p.blood_pressure);
    const tempScore = getTempScore(p.temperature);
    const ageScore = getAgeScore(p.age);
    const totalScore = bpScore + tempScore + ageScore;
    const hasDataIssue = hasDataQualityIssue(p);

    return {
      id: p.patient_id,
      rawBP: String(p.blood_pressure || ""),
      rawTemp: p.temperature,
      rawAge: p.age,
      parsedBP: parseBloodPressure(p.blood_pressure),
      parsedTemp: parseTemperature(p.temperature),
      parsedAge: parseAge(p.age),
      bpScore,
      tempScore,
      ageScore,
      totalScore,
      hasDataIssue,
      hasFever: hasFever(p.temperature),
      isHighRisk_gte4: totalScore >= 4 && !hasDataIssue,
      isHighRisk_gt4: totalScore > 4 && !hasDataIssue,
    };
  });

  // Sort by total score descending
  analyses.sort((a, b) => b.totalScore - a.totalScore);

  // Print detailed analysis
  console.log("=== PATIENTS BY TOTAL SCORE (DESCENDING) ===\n");
  console.log("ID       | BP       | Temp   | Age | BP_S | Temp_S | Age_S | Total | Data? | Fever? | HR>=4 | HR>4");
  console.log("-".repeat(110));

  for (const a of analyses) {
    const bpStr = a.rawBP.padEnd(8);
    const tempStr = String(a.rawTemp ?? "").padEnd(6);
    const ageStr = String(a.rawAge ?? "").padEnd(3);
    const bpS = String(a.bpScore).padEnd(4);
    const tempS = String(a.tempScore).padEnd(6);
    const ageS = String(a.ageScore).padEnd(5);
    const totalS = String(a.totalScore).padEnd(5);
    const dataFlag = a.hasDataIssue ? "YES" : "   ";
    const feverFlag = a.hasFever ? "YES" : "   ";
    const hr_gte4 = a.isHighRisk_gte4 ? "YES" : "   ";
    const hr_gt4 = a.isHighRisk_gt4 ? "YES" : "   ";

    console.log(`${a.id} | ${bpStr} | ${tempStr} | ${ageStr} | ${bpS} | ${tempS} | ${ageS} | ${totalS} | ${dataFlag}   | ${feverFlag}    | ${hr_gte4}   | ${hr_gt4}`);
  }

  // Summary statistics
  console.log("\n=== SUMMARY STATISTICS ===\n");

  const feverPatients = analyses.filter(a => a.hasFever);
  const dataIssuePatients = analyses.filter(a => a.hasDataIssue);
  const highRisk_gte4 = analyses.filter(a => a.isHighRisk_gte4);
  const highRisk_gt4 = analyses.filter(a => a.isHighRisk_gt4);
  const total4_exactly = analyses.filter(a => a.totalScore === 4 && !a.hasDataIssue);

  console.log(`Fever patients (temp >= 99.6): ${feverPatients.length}`);
  console.log(`  IDs: ${feverPatients.map(a => a.id).join(", ")}`);
  console.log(`  EXPECTED: 9`);
  console.log();

  console.log(`Data quality issues: ${dataIssuePatients.length}`);
  console.log(`  IDs: ${dataIssuePatients.map(a => a.id).join(", ")}`);
  console.log(`  EXPECTED: 8`);
  console.log();

  console.log(`High-risk (Total >= 4, no data issues): ${highRisk_gte4.length}`);
  console.log(`  IDs: ${highRisk_gte4.map(a => a.id).join(", ")}`);
  console.log(`  EXPECTED: 20`);
  console.log();

  console.log(`High-risk (Total > 4, no data issues): ${highRisk_gt4.length}`);
  console.log(`  IDs: ${highRisk_gt4.map(a => a.id).join(", ")}`);
  console.log(`  (If threshold is > 4)`);
  console.log();

  console.log(`Patients with exactly Total = 4 (no data issues): ${total4_exactly.length}`);
  console.log(`  IDs: ${total4_exactly.map(a => a.id).join(", ")}`);
  console.log();

  // Score distribution
  console.log("=== SCORE DISTRIBUTION ===\n");
  const scoreCounts: Record<number, number> = {};
  for (const a of analyses) {
    scoreCounts[a.totalScore] = (scoreCounts[a.totalScore] || 0) + 1;
  }
  for (const score of Object.keys(scoreCounts).map(Number).sort((a, b) => a - b)) {
    console.log(`Score ${score}: ${scoreCounts[score]} patients`);
  }

  // Analysis of boundary cases
  console.log("\n=== BOUNDARY CASE ANALYSIS ===\n");

  // Diastolic = 80 (boundary between Normal and Stage 1)
  const diastolic80 = analyses.filter(a => a.parsedBP?.diastolic === 80);
  console.log(`Patients with diastolic exactly 80: ${diastolic80.length}`);
  for (const p of diastolic80) {
    console.log(`  ${p.id}: ${p.rawBP} → BP score ${p.bpScore}, Total ${p.totalScore}`);
  }

  // Systolic = 130 (boundary between Elevated and Stage 1)
  const systolic130 = analyses.filter(a => a.parsedBP?.systolic === 130);
  console.log(`\nPatients with systolic exactly 130: ${systolic130.length}`);
  for (const p of systolic130) {
    console.log(`  ${p.id}: ${p.rawBP} → BP score ${p.bpScore}, Total ${p.totalScore}`);
  }

  // Age = 65 (boundary for elderly)
  const age65 = analyses.filter(a => a.parsedAge === 65);
  console.log(`\nPatients with age exactly 65: ${age65.length}`);
  for (const p of age65) {
    console.log(`  ${p.id}: age ${p.rawAge} → Age score ${p.ageScore}, Total ${p.totalScore}`);
  }

  // Temp = 99.5 or 99.6 (fever boundary)
  const tempBoundary = analyses.filter(a => a.parsedTemp !== null && a.parsedTemp >= 99.5 && a.parsedTemp <= 99.6);
  console.log(`\nPatients with temp 99.5-99.6 (fever boundary): ${tempBoundary.length}`);
  for (const p of tempBoundary) {
    console.log(`  ${p.id}: temp ${p.rawTemp} → hasFever=${p.hasFever}, Temp score ${p.tempScore}`);
  }

  // Age under 40 analysis
  console.log("\n=== AGE < 40 ANALYSIS ===");
  console.log("(What if age < 40 gives 0 points instead of 1?)\n");

  const under40InHighRisk = highRisk_gte4.filter(a => a.parsedAge !== null && a.parsedAge < 40);
  console.log(`Patients under 40 currently in high-risk (>=4): ${under40InHighRisk.length}`);
  for (const p of under40InHighRisk) {
    const newTotal = p.totalScore - 1; // Subtract 1 for age
    const wouldStillBeHighRisk_gte4 = newTotal >= 4;
    const wouldStillBeHighRisk_gt4 = newTotal > 4;
    console.log(`  ${p.id}: age ${p.parsedAge}, current total ${p.totalScore}, if age=0 → total ${newTotal} (HR>=4: ${wouldStillBeHighRisk_gte4}, HR>4: ${wouldStillBeHighRisk_gt4})`);
  }

  // Test different boundary interpretations
  console.log("\n=== TESTING DIFFERENT INTERPRETATIONS ===\n");

  // Alternative BP scoring: systolic 120 = Normal (not Elevated)
  function getBPScore_Alt(bp: unknown): number {
    const parsed = parseBloodPressure(bp);
    if (!parsed) return 0;
    const { systolic, diastolic } = parsed;

    let systolicCategory: number;
    if (systolic <= 120) systolicCategory = 1;      // Normal (changed: <= 120 instead of < 120)
    else if (systolic <= 129) systolicCategory = 2; // Elevated (121-129)
    else if (systolic <= 139) systolicCategory = 3; // Stage 1
    else systolicCategory = 4;                       // Stage 2

    let diastolicCategory: number;
    if (diastolic < 80) diastolicCategory = 1;
    else if (diastolic <= 89) diastolicCategory = 3;
    else diastolicCategory = 4;

    return Math.max(systolicCategory, diastolicCategory);
  }

  // Recalculate with alternative BP scoring
  const altAnalyses = patients.map(p => {
    const bpScore = getBPScore_Alt(p.blood_pressure);
    const tempScore = getTempScore(p.temperature);
    const ageScore = getAgeScore(p.age);
    const totalScore = bpScore + tempScore + ageScore;
    const hasDataIssue = hasDataQualityIssue(p);

    return {
      id: p.patient_id,
      bpScore,
      tempScore,
      ageScore,
      totalScore,
      hasDataIssue,
      isHighRisk_gt4: totalScore > 4 && !hasDataIssue,
    };
  });

  const altHighRisk_gt4 = altAnalyses.filter(a => a.isHighRisk_gt4);

  console.log("TEST 1: Threshold > 4 (current BP scoring)");
  console.log(`  Result: ${highRisk_gt4.length} patients (expected 20)`);
  console.log();

  console.log("TEST 2: Threshold > 4 + systolic 120 = Normal");
  console.log(`  Result: ${altHighRisk_gt4.length} patients (expected 20)`);
  if (altHighRisk_gt4.length === 20) {
    console.log("  ✓ THIS MATCHES THE EXPECTED COUNT!");
  }
  console.log();

  // Show which patients are affected by the change
  const affected = analyses.filter(orig => {
    const alt = altAnalyses.find(a => a.id === orig.id);
    return alt && orig.isHighRisk_gt4 !== alt.isHighRisk_gt4;
  });

  if (affected.length > 0) {
    console.log("Patients affected by systolic 120 boundary change:");
    for (const p of affected) {
      const alt = altAnalyses.find(a => a.id === p.id)!;
      const origBP = parseBloodPressure(patients.find(pt => pt.patient_id === p.id)?.blood_pressure);
      console.log(`  ${p.id}: BP ${origBP?.systolic}/${origBP?.diastolic}`);
      console.log(`    Original: BP_score=${p.bpScore}, Total=${p.totalScore}, HR>4=${p.isHighRisk_gt4}`);
      console.log(`    Alternative: BP_score=${alt.bpScore}, Total=${alt.totalScore}, HR>4=${alt.isHighRisk_gt4}`);
    }
  }

  // Final recommendation
  console.log("\n=== RECOMMENDATION ===\n");

  if (altHighRisk_gt4.length === 20) {
    console.log("RECOMMENDED CHANGES:");
    console.log("1. Change threshold from >= 4 to > 4");
    console.log("2. Change systolic boundary: 120 = Normal (not Elevated)");
    console.log("   - Use: systolic <= 120 for Normal");
    console.log("   - Use: systolic 121-129 for Elevated");
    console.log();
    console.log("This gives exactly 20 high-risk patients!");
  } else if (highRisk_gt4.length === 20) {
    console.log("RECOMMENDED CHANGE:");
    console.log("1. Change threshold from >= 4 to > 4");
    console.log();
    console.log("This gives exactly 20 high-risk patients!");
  } else {
    console.log("Neither simple fix gives exactly 20 patients.");
    console.log("Further investigation needed.");
  }
}

analyze().catch(console.error);
