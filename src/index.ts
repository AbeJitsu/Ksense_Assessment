// ============================================
// KSENSE HEALTHCARE API ASSESSMENT SOLUTION
// Fetches patient data, calculates risk scores, and submits results
// ============================================

import * as dotenv from "dotenv";

// Load environment variables from .env file
dotenv.config();

// ============================================
// CONFIGURATION
// API credentials loaded from environment variables for security
// ============================================
const BASE_URL = process.env.API_BASE_URL || "https://assessment.ksensetech.com/api";
const API_KEY = process.env.API_KEY;

// Validate required environment variables
if (!API_KEY) {
  console.error("Error: API_KEY environment variable is required");
  console.error("Please create a .env file with your API key (see .env.example)");
  process.exit(1);
}

// ============================================
// TYPE DEFINITIONS
// Define the shape of data we work with throughout the application
// ============================================

// Patient record from the API - may have missing or malformed fields
interface Patient {
  patient_id: string;
  blood_pressure?: string;
  temperature?: string | number;
  age?: string | number;
  [key: string]: unknown; // Allow for additional fields we don't use
}

// Paginated API response structure
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
  metadata?: {
    timestamp: string;
    version: string;
    requestId: string;
  };
}

// Final assessment results to submit
interface AssessmentResult {
  high_risk_patients: string[];   // Patients with total score > 4 (strictly greater than)
  fever_patients: string[];       // Patients with temp >= 99.6°F
  data_quality_issues: string[];  // Patients with invalid/missing data
}

// Detailed risk score breakdown for a single patient
interface RiskScoreResult {
  bp: number;           // Blood pressure score (0-4)
  temp: number;         // Temperature score (0-2)
  age: number;          // Age score (0-2)
  total: number;        // Sum of all scores
  hasFever: boolean;    // True if temp >= 99.6°F
  hasDataIssue: boolean; // True if any field is invalid/missing
}

// ============================================
// UTILITY FUNCTIONS
// Helper functions used throughout the application
// ============================================

/**
 * Pauses execution for a specified duration
 * Used for exponential backoff between retry attempts
 */
const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

// ============================================
// API FETCHER WITH RETRY LOGIC
// Handles rate limits (429) and server errors (500, 503)
// Uses exponential backoff to avoid overwhelming the server
// ============================================

/**
 * Makes an API request with automatic retry on transient failures
 *
 * Why we need this:
 * - The API has ~8% chance of 500/503 errors
 * - Rate limiting may return 429 errors
 * - Exponential backoff prevents hammering the server
 *
 * @param url - The endpoint to fetch
 * @param options - Fetch options (method, body, etc.)
 * @param maxRetries - Maximum number of retry attempts (default: 5)
 * @returns The parsed JSON response
 */
async function fetchWithRetry<T>(
  url: string,
  options: RequestInit = {},
  maxRetries: number = 5
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Make the API request with authentication header
      const response = await fetch(url, {
        ...options,
        headers: {
          "x-api-key": API_KEY,
          "Content-Type": "application/json",
          ...options.headers,
        },
      });

      // Success - return the parsed response
      if (response.ok) {
        return (await response.json()) as T;
      }

      // Retryable errors: rate limit (429), server errors (500, 503)
      // Wait with exponential backoff before retrying
      if ([429, 500, 503].includes(response.status)) {
        // Calculate delay: 1s, 2s, 4s, 8s, 16s + random jitter
        const delay = Math.pow(2, attempt) * 1000 + Math.random() * 500;
        console.log(
          `  [Retry] Status ${response.status}, attempt ${attempt + 1}/${maxRetries}, waiting ${Math.round(delay)}ms`
        );
        await sleep(delay);
        lastError = new Error(`HTTP ${response.status}`);
        continue;
      }

      // Non-retryable error (4xx except 429) - fail immediately
      // Try to get error details from response body
      let errorDetails = "";
      try {
        const errorBody = await response.json();
        errorDetails = JSON.stringify(errorBody, null, 2);
      } catch {
        errorDetails = response.statusText;
      }
      throw new Error(`HTTP ${response.status}: ${errorDetails}`);
    } catch (error) {
      // Re-throw HTTP errors we created above
      if (error instanceof Error && error.message.startsWith("HTTP")) {
        throw error;
      }
      // Network error - retry with backoff
      const delay = Math.pow(2, attempt) * 1000 + Math.random() * 500;
      console.log(
        `  [Retry] Network error, attempt ${attempt + 1}/${maxRetries}, waiting ${Math.round(delay)}ms`
      );
      await sleep(delay);
      lastError = error as Error;
    }
  }

  throw lastError || new Error("Max retries exceeded");
}

// ============================================
// PATIENT DATA FETCHER
// Retrieves all patients across multiple pages
// ============================================

/**
 * Fetches all patients from the API with pagination
 *
 * Uses limit=20 (max allowed) to minimize the number of requests
 * Handles inconsistent API responses where pagination may be missing
 *
 * @returns Array of all patient records
 */
async function fetchAllPatients(): Promise<Patient[]> {
  const allPatients: Patient[] = [];
  let page = 1;
  let totalPages = 1;

  console.log("\n=== Fetching Patients ===");

  // Keep fetching until we've retrieved all pages
  while (page <= totalPages) {
    console.log(`Fetching page ${page}...`);

    const response = await fetchWithRetry<PaginatedResponse>(
      `${BASE_URL}/patients?page=${page}&limit=20`
    );

    // Handle inconsistent API responses - pagination object might be missing
    // This is one of the "quirks" mentioned in the API docs
    const pagination = response.pagination || {};
    const respPage = pagination.page ?? page;
    const respTotalPages = pagination.totalPages ?? totalPages;
    const respTotal = pagination.total ?? "unknown";

    console.log(`  API Response: page=${respPage}, totalPages=${respTotalPages}, total=${respTotal}`);

    // Add patients from data array (handle if data is also inconsistent)
    const patients = Array.isArray(response.data) ? response.data : [];
    allPatients.push(...patients);

    // Update totalPages only if we got a valid value from the API
    if (pagination.totalPages !== undefined) {
      totalPages = pagination.totalPages;
    }

    console.log(
      `  Got ${patients.length} patients (total so far: ${allPatients.length})`
    );

    page++;
  }

  console.log(`\nTotal patients fetched: ${allPatients.length}`);
  return allPatients;
}

// ============================================
// BLOOD PRESSURE PARSING AND SCORING
// Handles format: "systolic/diastolic" (e.g., "120/80")
// ============================================

/**
 * Parses a blood pressure string into systolic and diastolic values
 *
 * Valid formats: "120/80", "120 / 80", "120\80"
 * Invalid examples: "INVALID", "150/", "/90", "N/A", null
 *
 * @param bp - Blood pressure value (may be string, null, or undefined)
 * @returns Parsed values or null if invalid
 */
function parseBloodPressure(bp: unknown): { systolic: number; diastolic: number } | null {
  // Handle missing values
  if (bp === null || bp === undefined || bp === "") return null;

  const bpStr = String(bp).trim();

  // Match pattern: digits / digits (with optional whitespace)
  const match = bpStr.match(/^(\d+)\s*[\/\\]\s*(\d+)$/);
  if (!match) return null;

  const systolic = parseInt(match[1], 10);
  const diastolic = parseInt(match[2], 10);

  // Validate the parsed numbers
  if (isNaN(systolic) || isNaN(diastolic)) return null;
  if (systolic <= 0 || diastolic <= 0) return null;
  if (systolic < diastolic) return null; // Systolic should always be >= diastolic

  return { systolic, diastolic };
}

/**
 * Calculates blood pressure risk score
 *
 * Scoring rules (use HIGHER stage if systolic and diastolic differ):
 * - Normal (Systolic <=120 AND Diastolic <80): 1 point
 * - Elevated (Systolic 121-129 AND Diastolic <80): 2 points
 * - Stage 1 (Systolic 130-139 OR Diastolic 80-89): 3 points
 * - Stage 2 (Systolic >=140 OR Diastolic >=90): 4 points
 * - Invalid/Missing: 0 points
 *
 * Note: Systolic 120 is treated as Normal (boundary inclusive)
 * This matches the API's interpretation of the scoring rules.
 *
 * @param bp - Blood pressure value
 * @returns Risk score (0-4)
 */
function getBPScore(bp: unknown): number {
  const parsed = parseBloodPressure(bp);
  if (!parsed) return 0; // Invalid or missing data

  const { systolic, diastolic } = parsed;

  // Determine risk category for systolic value
  // Note: 120 is treated as Normal (not Elevated) per API interpretation
  let systolicCategory: number;
  if (systolic <= 120) systolicCategory = 1;      // Normal (includes 120)
  else if (systolic <= 129) systolicCategory = 2; // Elevated (121-129)
  else if (systolic <= 139) systolicCategory = 3; // Stage 1 (130-139)
  else systolicCategory = 4;                       // Stage 2 (>=140)

  // Determine risk category for diastolic value
  // Note: Diastolic doesn't have an "Elevated" category
  let diastolicCategory: number;
  if (diastolic < 80) diastolicCategory = 1;      // Normal/Elevated range
  else if (diastolic <= 89) diastolicCategory = 3; // Stage 1
  else diastolicCategory = 4;                      // Stage 2

  // Use the HIGHER risk stage as specified in requirements
  return Math.max(systolicCategory, diastolicCategory);
}

// ============================================
// TEMPERATURE PARSING AND SCORING
// Handles temperatures in Fahrenheit
// ============================================

/**
 * Parses a temperature value
 *
 * Handles: numbers, strings with units ("98.6°F"), plain strings
 * Rejects: non-numeric values, unrealistic temperatures (<90 or >115)
 *
 * @param temp - Temperature value
 * @returns Parsed temperature or null if invalid
 */
function parseTemperature(temp: unknown): number | null {
  if (temp === null || temp === undefined || temp === "") return null;

  let tempNum: number;

  if (typeof temp === "number") {
    tempNum = temp;
  } else {
    // Strip unit suffixes (°F, F, etc.) and parse
    const tempStr = String(temp).trim().replace(/[°FfCc]/g, "");
    tempNum = parseFloat(tempStr);
  }

  // Validate the parsed value
  if (isNaN(tempNum)) return null;
  if (tempNum < 90 || tempNum > 115) return null; // Unrealistic body temperatures

  return tempNum;
}

/**
 * Calculates temperature risk score
 *
 * Scoring rules:
 * - Normal (<=99.5°F): 0 points
 * - Low Fever (99.6-100.9°F): 1 point
 * - High Fever (>=101.0°F): 2 points
 * - Invalid/Missing: 0 points
 *
 * @param temp - Temperature value
 * @returns Risk score (0-2)
 */
function getTempScore(temp: unknown): number {
  const parsed = parseTemperature(temp);
  if (parsed === null) return 0; // Invalid or missing data

  if (parsed <= 99.5) return 0;  // Normal
  if (parsed <= 100.9) return 1; // Low fever
  return 2;                       // High fever
}

/**
 * Checks if patient has a fever (temp >= 99.6°F)
 * Used for the fever_patients output list
 */
function hasFever(temp: unknown): boolean {
  const parsed = parseTemperature(temp);
  if (parsed === null) return false;
  return parsed >= 99.6;
}

// ============================================
// AGE PARSING AND SCORING
// ============================================

/**
 * Parses an age value
 *
 * Handles: numbers, numeric strings, strings with units ("45 years")
 * Rejects: non-numeric strings ("fifty-three"), null, unrealistic ages
 *
 * @param age - Age value
 * @returns Parsed age (integer) or null if invalid
 */
function parseAge(age: unknown): number | null {
  if (age === null || age === undefined || age === "") return null;

  let ageNum: number;

  if (typeof age === "number") {
    ageNum = age;
  } else {
    // Extract only digits and decimal points
    const ageStr = String(age).trim().replace(/[^\d.]/g, "");
    ageNum = parseFloat(ageStr);
  }

  // Validate the parsed value
  if (isNaN(ageNum)) return null;
  if (ageNum < 0 || ageNum > 150) return null; // Unrealistic ages

  return Math.floor(ageNum); // Use integer age
}

/**
 * Calculates age risk score
 *
 * Scoring rules:
 * - Under 40: 1 point
 * - 40-65 (inclusive): 1 point
 * - Over 65: 2 points
 * - Invalid/Missing: 0 points
 *
 * @param age - Age value
 * @returns Risk score (0-2)
 */
function getAgeScore(age: unknown): number {
  const parsed = parseAge(age);
  if (parsed === null) return 0; // Invalid or missing data

  if (parsed > 65) return 2;     // Higher risk for elderly
  return 1;                       // Standard risk for all others
}

// ============================================
// DATA QUALITY VALIDATION
// Identifies patients with missing or malformed data
// ============================================

/**
 * Checks if a patient has any data quality issues
 * A patient has issues if ANY of their fields (BP, temp, age) is invalid/missing
 *
 * @param patient - Patient record to validate
 * @returns True if patient has data quality issues
 */
function hasDataQualityIssue(patient: Patient): boolean {
  const bpValid = parseBloodPressure(patient.blood_pressure) !== null;
  const tempValid = parseTemperature(patient.temperature) !== null;
  const ageValid = parseAge(patient.age) !== null;

  // Return true if ANY field is invalid
  return !bpValid || !tempValid || !ageValid;
}

// ============================================
// RISK SCORE CALCULATOR
// Combines all scoring functions for a single patient
// ============================================

/**
 * Calculates the complete risk score for a patient
 * Total Risk Score = BP Score + Temperature Score + Age Score
 *
 * @param patient - Patient record to score
 * @returns Detailed score breakdown
 */
function calculateRiskScore(patient: Patient): RiskScoreResult {
  const bp = getBPScore(patient.blood_pressure);
  const temp = getTempScore(patient.temperature);
  const age = getAgeScore(patient.age);

  return {
    bp,
    temp,
    age,
    total: bp + temp + age,
    hasFever: hasFever(patient.temperature),
    hasDataIssue: hasDataQualityIssue(patient),
  };
}

// ============================================
// PATIENT CATEGORIZATION
// Sorts patients into the three required output lists
// ============================================

/**
 * Categorizes all patients into the required output lists
 *
 * Output lists:
 * - high_risk_patients: patient_id where total score > 4 (strictly greater than)
 * - fever_patients: patient_id where temperature >= 99.6°F
 * - data_quality_issues: patient_id where any field is invalid/missing
 *
 * Note: High-risk threshold is > 4 (not >= 4) based on API behavior analysis.
 * Patients with data quality issues are excluded from high-risk classification
 * since their risk score cannot be reliably calculated.
 *
 * @param patients - Array of patient records
 * @returns Categorized patient IDs
 */
function categorizePatients(patients: Patient[]): AssessmentResult {
  const result: AssessmentResult = {
    high_risk_patients: [],
    fever_patients: [],
    data_quality_issues: [],
  };

  console.log("\n=== Processing Patients ===");

  for (const patient of patients) {
    const score = calculateRiskScore(patient);

    // Log each patient's scores for debugging
    console.log(
      `Patient ${patient.patient_id}: BP=${score.bp} Temp=${score.temp} Age=${score.age} Total=${score.total}` +
        (score.hasFever ? " [FEVER]" : "") +
        (score.hasDataIssue ? " [DATA_ISSUE]" : "") +
        (score.total > 4 && !score.hasDataIssue ? " [HIGH_RISK]" : "")
    );

    // Categorize based on criteria
    // High-risk: Total score > 4 (strictly greater than, not >= 4)
    // Patients with data quality issues are excluded from high-risk
    if (score.total > 4 && !score.hasDataIssue) {
      result.high_risk_patients.push(patient.patient_id);
    }

    if (score.hasFever) {
      result.fever_patients.push(patient.patient_id);
    }

    if (score.hasDataIssue) {
      result.data_quality_issues.push(patient.patient_id);
    }
  }

  return result;
}

// ============================================
// ASSESSMENT SUBMISSION
// Sends results to the API endpoint
// ============================================

/**
 * Submits the assessment results to the API
 * Note: Only 3 submission attempts are allowed per API key
 *
 * @param result - Categorized patient lists
 * @returns API response with score and feedback
 */
async function submitAssessment(
  result: AssessmentResult
): Promise<{ success: boolean; message: string }> {
  console.log("\n=== Submitting Assessment ===");
  console.log(`High Risk Patients: ${result.high_risk_patients.length}`);
  console.log(`Fever Patients: ${result.fever_patients.length}`);
  console.log(`Data Quality Issues: ${result.data_quality_issues.length}`);

  const response = await fetchWithRetry<{ success: boolean; message: string }>(
    `${BASE_URL}/submit-assessment`,
    {
      method: "POST",
      body: JSON.stringify(result),
    }
  );

  return response;
}

// ============================================
// MAIN EXECUTION
// Orchestrates the entire assessment process
// ============================================

/**
 * Main entry point
 *
 * Supports --dry-run flag to test without submitting
 * This is crucial since we only have 3 submission attempts
 */
async function main(): Promise<void> {
  const isDryRun = process.argv.includes("--dry-run");

  console.log("Ksense Healthcare API Assessment");
  console.log("=================================");
  if (isDryRun) {
    console.log("*** DRY RUN MODE - Will NOT submit ***\n");
  }

  try {
    // Step 1: Fetch all patients from the API
    const patients = await fetchAllPatients();

    // Step 2: Show raw data for verification (helpful for debugging)
    console.log("\n=== Raw Patient Data (for verification) ===");
    for (const p of patients) {
      console.log(`${p.patient_id}: BP="${p.blood_pressure}" Temp=${p.temperature} Age=${p.age}`);
    }

    // Step 3: Calculate scores and categorize patients
    const result = categorizePatients(patients);

    // Step 4: Display summary
    console.log("\n=== Summary ===");
    console.log(`Total patients: ${patients.length}`);
    console.log(`High risk (score > 4): ${result.high_risk_patients.length}`);
    console.log(`  IDs: [${result.high_risk_patients.join(", ")}]`);
    console.log(`Fever (temp >= 99.6): ${result.fever_patients.length}`);
    console.log(`  IDs: [${result.fever_patients.join(", ")}]`);
    console.log(`Data quality issues: ${result.data_quality_issues.length}`);
    console.log(`  IDs: [${result.data_quality_issues.join(", ")}]`);

    // Step 5: Submit results (unless dry run)
    if (isDryRun) {
      console.log("\n=== DRY RUN - Skipping submission ===");
      console.log("Run without --dry-run to submit");
    } else {
      const submission = await submitAssessment(result);
      console.log("\n=== Submission Result ===");
      console.log(JSON.stringify(submission, null, 2));
    }
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

// Start the application
main();
