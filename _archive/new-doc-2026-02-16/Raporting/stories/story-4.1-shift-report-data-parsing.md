# Story 4.1: Shift Report Data Parsing & Infrastructure

## Story Overview
**Epic**: Shift Report Analysis
**Priority**: High (Foundation for all Shift Report features)
**Estimated Effort**: 2-3 development sessions
**Dependencies**: Story 1.1 (Project Scaffold & Excel Parsing Infrastructure)

### User Story
> As a **Supervisor or Manager**, I want the application to **automatically parse the daily Shift Report Excel file** so that I can **view shift performance data, issues, and supervisor comments** without manually opening and navigating complex spreadsheets.

---

## Acceptance Criteria

### AC 4.1.1: File Input UI for Shift Report
- **Given** the user is on the Shift Report tab
- **When** they click the "Load Shift Report" button
- **Then** a file picker opens filtered to `.xlsx` files
- **And** the selected file name is displayed with the detected date
- **And** a progress bar appears showing parsing status

### AC 4.1.2: Multi-Sheet Parser
- **Given** a valid Shift Report Excel file is selected
- **When** parsing begins
- **Then** data is extracted from all key sheets:
  - `REPORT Daily` (combined daily summary)
  - `SORT DAILY`, `SORT AM`, `SORT PM` (downtime by line)
  - `ACTIONS AM`, `ACTIONS PM` (supervisor 2-hour reviews)
  - `HOURLY AM`, `HOURLY PM` (hourly line data)
  - `QC Hold AM`, `QC Hold PM` (quality holds)
  - `Downtime Data`, `Downtime Line` (detailed downtime)
- **And** missing sheets are handled gracefully with warnings (not errors)

### AC 4.1.3: SORT Sheet Column Mapping
- **Given** the parser processes `SORT DAILY` / `SORT AM` / `SORT PM`
- **When** data rows are read (starting from row 4)
- **Then** columns are mapped as:
  | Column | Field | Type |
  |--------|-------|------|
  | Col 1 | `line` | string (e.g., "L22") |
  | Col 2 | `overallTotalMins` | number |
  | Col 3 | `peopleTotalMins` | number |
  | Col 4 | `peopleDetails` | string (issue descriptions) |
  | Col 5 | `processTotalMins` | number |
  | Col 6 | `processDetails` | string (issue descriptions) |
  | Col 7 | `plantTotalMins` | number |
  | Col 8 | `plantDetails` | string (issue descriptions) |
  | Col 9 | `actions` | string (concatenated) |
- **And** rows with `overallTotalMins === 0` are included but flagged as "no issues"
- **And** rows are sorted by `overallTotalMins` descending

### AC 4.1.4: ACTIONS Sheet Parsing (2-Hour Review Blocks)
- **Given** the parser processes `ACTIONS AM` / `ACTIONS PM`
- **When** data rows are read (starting from row 5, headers at row 4)
- **Then** 2-hour review blocks are extracted:
  | Column | Field | Type |
  |--------|-------|------|
  | Col 1 | `hour` | string (e.g., "H01", "H03", "H05", "H07") |
  | Col 2 | `number` | string (e.g., "1)", "2)") |
  | Col 3 | `keyIssue` | string |
  | Col 4 | `actionsTaken` | string |
  | Col 5 | `supportRequired` | string |
  | Col 8 | `efficiencyPct` | number |
  | Col 9 | `hrsVsPlan` | number |
  | Col 10 | `linesRun` | number |
  | Col 11 | `cases` | number |
  | Col 12 | `packets` | number |
- **And** the shift identifier (AM/PM) is attached to each block
- **And** the date is extracted from row 3, Col 5
- **And** empty rows between blocks are skipped
- **And** the "Total" row (row 17) is parsed separately as shift summary

### AC 4.1.5: REPORT Daily KPI Extraction
- **Given** the parser processes `REPORT Daily`
- **When** the summary section is read (rows 1-20)
- **Then** the following KPIs are extracted:
  | Row | Col | Field | Example |
  |-----|-----|-------|---------|
  | 3 | 4 | `efficiency` | "76%" |
  | 3 | 9 | `hoursVsPlan` | "-0.8" |
  | 3 | 14 | `changeovers` | "22" |
  | 3 | 20 | `plannedLines` | "19" |
  | 6 | 4 | `lostEffGrading` | "0.0%" |
  | 6 | 9 | `giveawayPct` | "0.02" |
  | 6 | 14 | `yieldVariance` | "-£423" |
  | 6 | 20 | `actualLines` | "19" |
  | 9 | 4 | `lostEffRates` | "0.0%" |
  | 9 | 9 | `dieChanges` | "3" |
  | 9 | 14 | `slowRunning` | "17%" |
  | 9 | 20 | `accidents` | "1" |
  | 12 | 4 | `engDowntime` | "2.7%" |
  | 12 | 9 | `blowdowns` | "3" |
  | 12 | 14 | `stops` | "-19%" |
  | 12 | 20 | `shiftStaffing` | "2" |
  | 15 | 4 | `staffingAccuracy` | value |
  | 15 | 9 | `washdowns` | "4" |
  | 15 | 14 | `repacks` | "-" |
  | 15 | 20 | `nearMissReports` | "4" |
- **And** the date is extracted from row 2, Col 16
- **And** accident details are extracted from rows 18-19

### AC 4.1.6: QC Hold Sheet Parsing
- **Given** the parser processes `QC Hold AM` / `QC Hold PM`
- **When** data rows are read (starting from row 4, headers at row 3)
- **Then** hold records are extracted:
  | Column | Field | Type |
  |--------|-------|------|
  | Col 2 | `line` | string |
  | Col 3 | `code` | string (product code) |
  | Col 4 | `boxesHeld` | number |
  | Col 5 | `boxesRejected` | number |
  | Col 6 | `staffCount` | number |
  | Col 7 | `startTime` | time |
  | Col 8 | `endTime` | time |
  | Col 9 | `timeTaken` | duration |
  | Col 10 | `totalStaffingTime` | duration |
  | Col 13 | `totalLabourHours` | number |
- **And** empty rows are skipped
- **And** the REPORT Daily QC Hold section (rows 40-51) is also parsed for combined view with reason/corrective action (Col 11)

### AC 4.1.7: IndexedDB Storage with Date Keys
- **Given** shift report data has been parsed
- **When** storage is triggered
- **Then** data is stored in IndexedDB with the structure:
  ```
  shiftReports/{YYYY-MM-DD}/summary     → Daily KPIs
  shiftReports/{YYYY-MM-DD}/sortDaily   → SORT DAILY data
  shiftReports/{YYYY-MM-DD}/sortAM      → SORT AM data
  shiftReports/{YYYY-MM-DD}/sortPM      → SORT PM data
  shiftReports/{YYYY-MM-DD}/actionsAM   → ACTIONS AM data
  shiftReports/{YYYY-MM-DD}/actionsPM   → ACTIONS PM data
  shiftReports/{YYYY-MM-DD}/hourlyAM    → HOURLY AM data
  shiftReports/{YYYY-MM-DD}/hourlyPM    → HOURLY PM data
  shiftReports/{YYYY-MM-DD}/qcHoldAM    → QC Hold AM data
  shiftReports/{YYYY-MM-DD}/qcHoldPM    → QC Hold PM data
  shiftReports/{YYYY-MM-DD}/downtime    → Downtime Data
  shiftReports/dates                    → Array of available dates
  ```
- **And** loading a file for an existing date overwrites the previous data
- **And** the dates index is always updated

### AC 4.1.8: Team Trend File Parsing
- **Given** the user loads a Team Trend `.xlsb` file
- **When** parsing begins
- **Then** team performance trend data is extracted
- **And** data is stored in IndexedDB under `teamTrend/` keys
- **And** the parser handles the binary `.xlsb` format via SheetJS
- **Note**: SheetJS supports `.xlsb` natively — no conversion needed

### AC 4.1.9: Progress Indicator
- **Given** parsing is in progress
- **When** each sheet completes
- **Then** the progress bar updates with:
  - Current sheet name being parsed
  - Percentage complete (based on sheet count)
  - Row count for current sheet
  - Estimated time remaining
- **And** the UI remains responsive during parsing (Web Worker or chunked processing)

### AC 4.1.10: Error Handling
- **Given** a file is loaded that has issues
- **When** parsing encounters problems
- **Then** the following errors are handled:
  - Missing expected sheets → Warning toast, continue with available sheets
  - Malformed data in cells → Skip row, log warning
  - Wrong file type → Error message "Please select a Shift Report Excel file"
  - File too large → Warning about potential slow processing
  - Corrupted file → Error message with retry option
- **And** all errors are logged to console with sheet name and row number
- **And** a summary toast shows "Parsed X of Y sheets successfully"

---

## Technical Implementation Plan

### Frontend Architecture

#### File Structure
```
src/
├── components/
│   └── shift-report/
│       ├── ShiftReportFileLoader.tsx    # File input + progress UI
│       ├── ShiftReportTab.tsx           # Main tab container
│       └── ShiftReportContext.tsx        # React context for shift data
├── lib/
│   └── parsers/
│       ├── shift-report-parser.ts       # Main orchestrator
│       ├── sort-sheet-parser.ts         # SORT DAILY/AM/PM parser
│       ├── actions-sheet-parser.ts      # ACTIONS AM/PM parser
│       ├── report-daily-parser.ts       # REPORT Daily KPI parser
│       ├── qc-hold-parser.ts            # QC Hold parser
│       ├── hourly-sheet-parser.ts       # HOURLY AM/PM parser
│       ├── downtime-parser.ts           # Downtime Data/Line parser
│       └── team-trend-parser.ts         # Team Trend .xlsb parser
├── stores/
│   └── shift-report-store.ts            # IndexedDB operations
└── types/
    └── shift-report.ts                  # TypeScript interfaces
```

#### TypeScript Interfaces
```typescript
// types/shift-report.ts

interface ShiftReportData {
  date: string; // YYYY-MM-DD
  summary: DailySummary;
  sortDaily: DowntimeByLine[];
  sortAM: DowntimeByLine[];
  sortPM: DowntimeByLine[];
  actionsAM: SupervisorReview[];
  actionsPM: SupervisorReview[];
  hourlyAM: HourlyLineData[];
  hourlyPM: HourlyLineData[];
  qcHoldAM: QCHoldRecord[];
  qcHoldPM: QCHoldRecord[];
  downtimeData: DowntimeRecord[];
}

interface DowntimeByLine {
  line: string;
  overallTotalMins: number;
  peopleTotalMins: number;
  peopleDetails: string;
  processTotalMins: number;
  processDetails: string;
  plantTotalMins: number;
  plantDetails: string;
  actions: string;
  primaryCategory: 'people' | 'process' | 'plant';
}

interface SupervisorReview {
  shift: 'AM' | 'PM';
  hour: string;
  number: string;
  keyIssue: string;
  actionsTaken: string;
  supportRequired: string;
  efficiencyPct: number | null;
  hrsVsPlan: number | null;
  linesRun: number | null;
  cases: number | null;
  packets: number | null;
}

interface DailySummary {
  date: string;
  efficiency: number;
  efficiencyTarget: number;
  hoursVsPlan: number;
  changeovers: number;
  plannedLines: number;
  actualLines: number;
  lostEffGrading: number;
  giveawayPct: number;
  yieldVariance: number;
  lostEffRates: number;
  dieChanges: number;
  slowRunning: number;
  accidents: number;
  engDowntime: number;
  blowdowns: number;
  stops: number;
  shiftStaffing: number;
  staffingAccuracy: number;
  washdowns: number;
  repacks: string;
  nearMissReports: number;
  accidentDetails: string;
  casesProduced: number;
  packetsProduced: number;
}

interface QCHoldRecord {
  shift: 'AM' | 'PM';
  line: string;
  code: string;
  boxesHeld: number;
  boxesRejected: number;
  staffCount: number;
  startTime: string;
  endTime: string;
  timeTaken: string;
  totalLabourHours: number;
  reason?: string;
  correctiveAction?: string;
}

interface HourlyLineData {
  shift: 'AM' | 'PM';
  hour: string;
  line: string;
  lineDesc: string;
  sku: string;
  description: string;
  changeovers: number;
  lineLeader: string;
  supervisor: string;
  breakMins: number;
  available: number;
  earnedAtPlan: number;
  lostHrsVsPlan: number;
  unavailHours: number;
  efficiencyPct: number | null;
  stopPct: number | null;
  repackPct: number | null;
  slowPct: number | null;
}

interface DowntimeRecord {
  hour: string;
  line: string;
  lineDesc: string;
  sku: string;
  description: string;
  changeovers: number;
  lineLeader: string;
  supervisor: string;
  breakMins: number;
  available: number;
  earnedAtPlan: number;
  lostHrsVsPlan: number;
  unavailHours: number;
  efficiencyPct: number | null;
  stopPct: number | null;
  multivacStops: number;
  repackPct: number | null;
  slowPct: number | null;
}
```

#### Parser Implementation Strategy

**Main Orchestrator** (`shift-report-parser.ts`):
```typescript
import * as XLSX from 'xlsx';

export async function parseShiftReport(
  file: File,
  onProgress: (sheet: string, pct: number) => void
): Promise<ShiftReportData> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  
  const sheetNames = workbook.SheetNames;
  const totalSheets = EXPECTED_SHEETS.length;
  let parsed = 0;
  
  // Extract date from filename: "Shift Report -2026-02-10.xlsx"
  const dateMatch = file.name.match(/(\d{4}-\d{2}-\d{2})/);
  const reportDate = dateMatch ? dateMatch[1] : extractDateFromSheet(workbook);
  
  const result: ShiftReportData = {
    date: reportDate,
    summary: parseReportDaily(workbook, 'REPORT Daily'),
    sortDaily: parseSortSheet(workbook, 'SORT DAILY'),
    sortAM: parseSortSheet(workbook, 'SORT AM'),
    sortPM: parseSortSheet(workbook, 'SORT PM'),
    actionsAM: parseActionsSheet(workbook, 'ACTIONS AM', 'AM'),
    actionsPM: parseActionsSheet(workbook, 'ACTIONS PM', 'PM'),
    // ... etc
  };
  
  return result;
}
```

**Chunked Processing for Large Sheets**:
- Use `requestAnimationFrame` or `setTimeout(0)` between sheet parsing to keep UI responsive
- For HOURLY sheets (305 rows × 65+ cols), process in batches of 50 rows
- Show per-sheet progress in the progress bar

#### IndexedDB Storage Strategy

Using `idb-keyval` for simple key-value storage:
```typescript
import { set, get, keys } from 'idb-keyval';

export async function storeShiftReport(data: ShiftReportData): Promise<void> {
  const prefix = `shiftReports/${data.date}`;
  
  await Promise.all([
    set(`${prefix}/summary`, data.summary),
    set(`${prefix}/sortDaily`, data.sortDaily),
    set(`${prefix}/sortAM`, data.sortAM),
    set(`${prefix}/sortPM`, data.sortPM),
    set(`${prefix}/actionsAM`, data.actionsAM),
    set(`${prefix}/actionsPM`, data.actionsPM),
    set(`${prefix}/hourlyAM`, data.hourlyAM),
    set(`${prefix}/hourlyPM`, data.hourlyPM),
    set(`${prefix}/qcHoldAM`, data.qcHoldAM),
    set(`${prefix}/qcHoldPM`, data.qcHoldPM),
  ]);
  
  // Update dates index
  const dates = (await get('shiftReports/dates')) || [];
  if (!dates.includes(data.date)) {
    dates.push(data.date);
    dates.sort().reverse(); // Most recent first
    await set('shiftReports/dates', dates);
  }
}
```

### Backend Considerations
This is a **client-side only** application — no backend server. All parsing happens in the browser using SheetJS. The Excel files are loaded via `<input type="file">` and processed entirely in JavaScript.

### Technology Choices

| Technology | Purpose | Why This Choice |
|-----------|---------|-----------------|
| **SheetJS (xlsx)** v0.20+ | Excel parsing | Industry standard, supports .xlsx and .xlsb, handles large files, no server needed |
| **idb-keyval** | IndexedDB wrapper | Minimal API, promise-based, perfect for key-value storage pattern |
| **Web Workers** (optional) | Background parsing | Keeps UI responsive during large file processing |
| **React Context** | State management | Lightweight, built-in, sufficient for shift report data flow |

### Performance Considerations
- Shift Report files are ~1-5MB (much smaller than the 70-80MB Line Yields files)
- Parsing should complete in 2-5 seconds
- IndexedDB caching means subsequent views are instant
- No need for Web Workers unless performance testing shows UI blocking

---

## UX Design Specification

### File Loader Component
```
┌─────────────────────────────────────────────────────────┐
│  📋 Shift Report                                    ⓘ  │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │  📁 Drop Shift Report file here or click to     │   │
│  │     browse                                       │   │
│  │                                                   │   │
│  │  Accepted: .xlsx files                           │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  Last loaded: 10/02/2026  ✅ 12 sheets parsed          │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │  ████████████████████░░░░  75%                   │   │
│  │  Parsing: HOURLY AM (row 150/305)               │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  Previously loaded dates:                               │
│  • 10/02/2026  • 09/02/2026  • 08/02/2026             │
└─────────────────────────────────────────────────────────┘
```

### Design Tokens (from reference images)
- **Background**: `#F8F9FA` (light gray, clean)
- **Card Background**: `#FFFFFF` with `box-shadow: 0 1px 3px rgba(0,0,0,0.08)`
- **Primary Accent**: `#6C5CE7` (purple, from dash 1.png)
- **Success**: `#00D2D3` (teal/cyan)
- **Warning**: `#FECA57` (amber)
- **Danger**: `#FF6B6B` (red)
- **Text Primary**: `#2D3436`
- **Text Secondary**: `#636E72`
- **Border**: `#E9ECEF`
- **Border Radius**: `12px` for cards, `8px` for inputs
- **Font**: Inter or system-ui, clean sans-serif
- **Spacing**: 8px grid system

---

## Testing Strategy

### Unit Tests
- Parser functions with mock Excel data (JSON fixtures)
- Column mapping validation for each sheet type
- Date extraction from filename and sheet cells
- Error handling for missing/malformed data

### Integration Tests
- Full file parse → IndexedDB store → retrieve cycle
- Multiple file loads (overwrite behavior)
- Date index management

### Manual Verification
- Compare parsed values with actual Excel file opened in Excel
- Verify all 21 sheets are attempted
- Check progress indicator accuracy
- Test with corrupted/incomplete files

---

## Definition of Done
- [ ] All 10 acceptance criteria pass
- [ ] TypeScript interfaces defined and exported
- [ ] All parser functions implemented with error handling
- [ ] IndexedDB storage working with date-based keys
- [ ] Progress indicator shows real-time parsing status
- [ ] File loader UI matches design specification
- [ ] Console logging for debugging (sheet names, row counts, errors)
- [ ] Code reviewed and documented
