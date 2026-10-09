// Builds KrystalHR_QA_Assessment_Report.xlsx from
//   - qa/test-cases.js            the test case catalogue
//   - qa/defects.js               the defect catalogue
//   - artifacts/results/*.json    results of the last `npm run cy:run`
//   - cypress/screenshots/**      end-state screenshot of every test
const ExcelJS = require("exceljs");
const fs = require("fs");
const path = require("path");

const testCases = require("./qa/test-cases");
const defects = require("./qa/defects");

const ROOT = __dirname;
const RESULTS_DIR = path.join(ROOT, "artifacts", "results");
const CONTEXT_FILE = path.join(ROOT, "artifacts", "run-context.json");
const SCREENSHOTS_DIR = path.join(ROOT, "cypress", "screenshots");
const OUTPUT = path.join(ROOT, "KrystalHR_QA_Assessment_Report.xlsx");

const MODULES = [
  "Dashboard",
  "Organization",
  "Sign Up",
  "Announcements",
  "Authentication",
  "Cross-module",
];
const SEVERITIES = ["Critical", "High", "Medium", "Low"];

const COLORS = {
  header: "1F4E78",
  subHeader: "D9E1F2",
  pass: { fill: "C6EFCE", font: "006100" },
  fail: { fill: "FFC7CE", font: "9C0006" },
  notRun: { fill: "EDEDED", font: "595959" },
  Critical: { fill: "7B0000", font: "FFFFFF" },
  High: { fill: "F4B183", font: "7F2A00" },
  Medium: { fill: "FFE699", font: "7F6000" },
  Low: { fill: "E2EFDA", font: "375623" },
};

// ------------------------------------------------------------------ inputs

function loadResults() {
  if (!fs.existsSync(RESULTS_DIR)) return { byId: {}, runs: [] };
  const runs = fs
    .readdirSync(RESULTS_DIR)
    .filter((file) => file.endsWith(".json"))
    .map((file) => JSON.parse(fs.readFileSync(path.join(RESULTS_DIR, file))));
  const byId = {};
  for (const run of runs) {
    for (const test of run.tests) byId[test.id] = { ...test, spec: run.spec };
  }
  return { byId, runs };
}

function findScreenshots() {
  const found = {};
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (
        entry.name.endsWith(".png") &&
        path.basename(dir) === "evidence"
      ) {
        found[path.basename(entry.name, ".png")] = full;
      }
    }
  };
  walk(SCREENSHOTS_DIR);
  return found;
}

const STATUS = { passed: "PASS", failed: "FAIL" };
const statusOf = (result) =>
  result ? STATUS[result.state] || "NOT RUN" : "NOT RUN";

// First line of a Cypress error, without the retry boilerplate.
const shortError = (error) =>
  (error || "")
    .replace(/Timed out retrying after \d+ms: /, "")
    .replace(/\n\s*\+ expected - actual\n/, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 6)
    .join(" ")
    .slice(0, 420);

// ------------------------------------------------------------------ styling

const thin = { style: "thin", color: { argb: "BFBFBF" } };
const BORDER = { top: thin, left: thin, bottom: thin, right: thin };

function styleHeader(row) {
  row.height = 30;
  row.eachCell((cell) => {
    cell.font = {
      name: "Calibri",
      size: 11,
      bold: true,
      color: { argb: "FFFFFF" },
    };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: COLORS.header },
    };
    cell.alignment = {
      vertical: "middle",
      horizontal: "center",
      wrapText: true,
    };
    cell.border = BORDER;
  });
}

function paint(cell, palette) {
  if (!palette) return;
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: palette.fill },
  };
  cell.font = {
    name: "Calibri",
    size: 11,
    bold: true,
    color: { argb: palette.font },
  };
  cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
}

const statusPalette = (status) =>
  ({ PASS: COLORS.pass, FAIL: COLORS.fail, "NOT RUN": COLORS.notRun })[status];

// Rough row height for wrapped text so rows are readable without resizing.
function fitRow(row, columns) {
  let lines = 1;
  row.eachCell((cell, col) => {
    const width = columns[col - 1].width || 10;
    const text = String(cell.value?.result ?? cell.value ?? "");
    const needed = text
      .split("\n")
      .reduce(
        (sum, line) =>
          sum + Math.max(1, Math.ceil(line.length / (width * 1.1))),
        0,
      );
    lines = Math.max(lines, needed);
  });
  row.height = Math.min(409, Math.max(18, lines * 15));
}

function addTable(sheet, columns, rows) {
  sheet.columns = columns;
  styleHeader(sheet.getRow(1));
  rows.forEach((data) => {
    const row = sheet.addRow(data);
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { name: "Calibri", size: 11 };
      cell.alignment = { vertical: "top", wrapText: true };
      cell.border = BORDER;
    });
    fitRow(row, columns);
  });
  sheet.views = [{ state: "frozen", xSplit: 1, ySplit: 1 }];
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: columns.length },
  };
}

const formula = (text, result) => ({ formula: text, result });

// ------------------------------------------------------------------ report

async function generateReport() {
  const { byId: results, runs } = loadResults();
  const screenshots = findScreenshots();
  const context = fs.existsSync(CONTEXT_FILE)
    ? JSON.parse(fs.readFileSync(CONTEXT_FILE))
    : {};

  const defectsByTest = {};
  for (const defect of defects) {
    for (const id of defect.tests) {
      defectsByTest[id] = [...(defectsByTest[id] || []), defect];
    }
  }

  const cases = testCases.map((testCase) => {
    const result = results[testCase.id];
    const status = statusOf(result);
    const linked = defectsByTest[testCase.id] || [];
    let actual = "Not executed in this run.";
    if (status === "PASS") actual = "As expected.";
    if (status === "FAIL") {
      actual = linked.length
        ? linked.map((defect) => defect.actual).join("\n")
        : "Did not behave as expected.";
      actual += `\n\nAutomated check: ${shortError(result.error)}`;
    }
    return { ...testCase, result, status, linked, actual };
  });

  const count = (items, predicate) => items.filter(predicate).length;
  const executed = count(cases, (c) => c.status !== "NOT RUN");
  const passed = count(cases, (c) => c.status === "PASS");
  const failed = count(cases, (c) => c.status === "FAIL");

  const reproduction = (defect) => {
    if (!defect.tests.length) return "Manual (exploratory)";
    const states = defect.tests.map((id) => statusOf(results[id]));
    if (states.includes("FAIL")) return "Yes";
    if (states.every((state) => state === "NOT RUN")) return "Not run";
    return "No - re-check";
  };

  const started = runs
    .map((run) => run.startedAt)
    .filter(Boolean)
    .sort()[0];
  const ended = runs
    .map((run) => run.endedAt)
    .filter(Boolean)
    .sort()
    .pop();
  const fmt = (iso) =>
    iso
      ? new Date(iso).toISOString().replace("T", " ").slice(0, 16) + " UTC"
      : "n/a";

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Michael Chilaka";
  workbook.created = new Date();
  // Summary figures are formulas over the other sheets: recalculate on open.
  workbook.calcProperties.fullCalcOnLoad = true;

  const summary = workbook.addWorksheet("Summary", {
    properties: { tabColor: { argb: COLORS.header } },
  });
  const caseSheet = workbook.addWorksheet("Test Cases");
  const defectSheet = workbook.addWorksheet("Defect Log", {
    properties: { tabColor: { argb: "C00000" } },
  });
  const successSheet = workbook.addWorksheet("Successes", {
    properties: { tabColor: { argb: "00B050" } },
  });
  const evidenceSheet = workbook.addWorksheet("Evidence");
  const notesSheet = workbook.addWorksheet("Scope & Notes");

  // ---------------------------------------------------------------- Test Cases
  const caseColumns = [
    { header: "Test ID", key: "id", width: 11 },
    { header: "Module", key: "module", width: 16 },
    { header: "Type", key: "type", width: 14 },
    { header: "Priority", key: "priority", width: 10 },
    { header: "Scenario", key: "title", width: 40 },
    { header: "Steps", key: "steps", width: 52 },
    { header: "Expected Result", key: "expected", width: 46 },
    { header: "Actual Result", key: "actual", width: 60 },
    { header: "Status", key: "status", width: 11 },
    { header: "Defect ID", key: "defect", width: 13 },
    { header: "Duration (s)", key: "duration", width: 12 },
  ];
  addTable(
    caseSheet,
    caseColumns,
    cases.map((c) => ({
      ...c,
      defect: c.status === "FAIL" ? c.linked.map((d) => d.id).join(", ") : "",
      duration: c.result ? Number((c.result.duration / 1000).toFixed(1)) : "",
    })),
  );
  caseSheet.eachRow((row, number) => {
    if (number === 1) return;
    paint(row.getCell("status"), statusPalette(row.getCell("status").value));
    row.getCell("id").font = { name: "Calibri", size: 11, bold: true };
  });

  // ---------------------------------------------------------------- Defect Log
  const defectColumns = [
    { header: "Defect ID", key: "id", width: 11 },
    { header: "Module", key: "module", width: 15 },
    { header: "Area / Feature", key: "area", width: 24 },
    { header: "Summary", key: "title", width: 44 },
    { header: "Severity", key: "severity", width: 11 },
    { header: "Priority", key: "priority", width: 9 },
    { header: "Type", key: "type", width: 15 },
    { header: "Preconditions", key: "preconditions", width: 30 },
    { header: "Steps to Reproduce", key: "steps", width: 52 },
    { header: "Expected Result", key: "expected", width: 42 },
    { header: "Actual Result", key: "actual", width: 62 },
    { header: "Evidence", key: "evidence", width: 36 },
    { header: "Test Cases", key: "tests", width: 14 },
    { header: "Reproduced in this run", key: "reproduced", width: 16 },
    { header: "Status", key: "status", width: 9 },
  ];
  addTable(
    defectSheet,
    defectColumns,
    defects.map((defect) => ({
      ...defect,
      tests: defect.tests.join(", "),
      reproduced: reproduction(defect),
      status: "Open",
    })),
  );
  defectSheet.eachRow((row, number) => {
    if (number === 1) return;
    paint(row.getCell("severity"), COLORS[row.getCell("severity").value]);
    row.getCell("id").font = { name: "Calibri", size: 11, bold: true };
    const reproduced = row.getCell("reproduced");
    if (reproduced.value === "Yes") paint(reproduced, COLORS.fail);
    if (reproduced.value === "No - re-check") paint(reproduced, COLORS.pass);
  });

  // ---------------------------------------------------------------- Successes
  const passedCases = cases.filter((c) => c.status === "PASS");
  addTable(
    successSheet,
    [
      { header: "Module", key: "module", width: 16 },
      { header: "Test ID", key: "id", width: 11 },
      { header: "What works", key: "title", width: 58 },
      { header: "Verified behaviour", key: "expected", width: 80 },
      { header: "Type", key: "type", width: 15 },
    ],
    [...passedCases].sort(
      (a, b) => MODULES.indexOf(a.module) - MODULES.indexOf(b.module),
    ),
  );

  // ---------------------------------------------------------------- Evidence
  evidenceSheet.columns = [{ width: 14 }, { width: 110 }];
  evidenceSheet.addRow([
    "Evidence",
    "End-state screenshot of each failed test case, grouped by defect. Emails were verified in /log-viewer (laravel-{date}.log).",
  ]);
  styleHeader(evidenceSheet.getRow(1));
  evidenceSheet.getRow(1).getCell(2).alignment = {
    vertical: "middle",
    horizontal: "left",
    wrapText: true,
  };
  const IMAGE = { width: 768, height: 432, rows: 22 };
  let cursor = 3;
  let embedded = 0;
  for (const defect of defects) {
    const shots = defect.tests.filter(
      (id) => statusOf(results[id]) === "FAIL" && screenshots[id],
    );
    if (!shots.length) continue;
    const heading = evidenceSheet.getRow(cursor);
    heading.values = [
      defect.id,
      `${defect.severity} | ${defect.module} | ${defect.title}`,
    ];
    heading.font = { name: "Calibri", size: 12, bold: true };
    heading.eachCell((cell) => {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: COLORS.subHeader },
      };
    });
    cursor += 1;
    for (const id of shots) {
      const testCase = cases.find((c) => c.id === id);
      evidenceSheet.getRow(cursor).values = [
        id,
        `${testCase.title}  (${path.relative(ROOT, screenshots[id])})`,
      ];
      evidenceSheet.getRow(cursor).font = {
        name: "Calibri",
        size: 10,
        italic: true,
      };
      const image = workbook.addImage({
        filename: screenshots[id],
        extension: "png",
      });
      evidenceSheet.addImage(image, {
        tl: { col: 1, row: cursor },
        ext: { width: IMAGE.width, height: IMAGE.height },
      });
      cursor += IMAGE.rows + 1;
      embedded += 1;
    }
    cursor += 1;
  }

  // ---------------------------------------------------------------- Summary
  summary.columns = [
    { width: 26 },
    { width: 13 },
    { width: 11 },
    { width: 11 },
    { width: 11 },
    { width: 12 },
    { width: 11 },
    { width: 11 },
    { width: 11 },
    { width: 11 },
    { width: 13 },
  ];
  const lastCase = cases.length + 1;
  const lastDefect = defects.length + 1;
  const caseRange = (column) =>
    `'Test Cases'!$${column}$2:$${column}$${lastCase}`;
  const defectRange = (column) =>
    `'Defect Log'!$${column}$2:$${column}$${lastDefect}`;

  summary.mergeCells("A1:K1");
  summary.getCell("A1").value =
    "KrystalHR Super Admin (Staging) - System Test Report";
  summary.getCell("A1").font = {
    name: "Calibri",
    size: 18,
    bold: true,
    color: { argb: "FFFFFF" },
  };
  summary.getCell("A1").fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: COLORS.header },
  };
  summary.getCell("A1").alignment = {
    vertical: "middle",
    horizontal: "left",
    indent: 1,
  };
  summary.getRow(1).height = 38;

  const meta = [
    [
      "Environment",
      runs[0]?.baseUrl || "https://admin.krystalhrsite.kdns.site",
    ],
    ["Test account", "tester@krystalhr.com (Super Admin)"],
    [
      "Modules in scope",
      "Dashboard, Organization, Sign Up, Announcements (+ login and cross-module checks)",
    ],
    [
      "Test level / approach",
      "System testing: exploratory session, then an automated Cypress suite that re-checks every scenario",
    ],
    [
      "Email verification",
      "/log-viewer > laravel-{date}.log (as instructed in the assessment brief)",
    ],
    ["Tested by", "Michael Chilaka"],
    ["Executed", `${fmt(started)} to ${fmt(ended)}`],
    [
      "Tooling",
      `Cypress ${runs[0]?.cypress || ""} on ${runs[0]?.browser || "Chrome"}, 1280x720`,
    ],
  ];
  meta.forEach(([label, value], index) => {
    const row = summary.getRow(3 + index);
    row.getCell(1).value = label;
    row.getCell(1).font = { name: "Calibri", size: 11, bold: true };
    summary.mergeCells(row.number, 2, row.number, 11);
    row.getCell(2).value = value;
    row.getCell(2).alignment = { wrapText: true, vertical: "top" };
  });

  // Overall figures
  let r = 3 + meta.length + 1;
  const section = (title) => {
    summary.mergeCells(r, 1, r, 11);
    const cell = summary.getCell(r, 1);
    cell.value = title;
    cell.font = {
      name: "Calibri",
      size: 13,
      bold: true,
      color: { argb: COLORS.header },
    };
    cell.border = {
      bottom: { style: "medium", color: { argb: COLORS.header } },
    };
    r += 1;
  };

  section("Overall result");
  const overallHeader = summary.getRow(r);
  overallHeader.values = [
    "Test cases",
    "Executed",
    "Passed",
    "Failed",
    "Not run",
    "Pass rate",
    "Defects",
    ...SEVERITIES,
  ];
  styleHeader(overallHeader);
  r += 1;
  const overall = summary.getRow(r);
  const severityCount = (severity) =>
    count(defects, (d) => d.severity === severity);
  overall.values = [
    formula(`COUNTA(${caseRange("A")})`, cases.length),
    formula(`C${r}+D${r}`, executed),
    formula(`COUNTIF(${caseRange("I")},"PASS")`, passed),
    formula(`COUNTIF(${caseRange("I")},"FAIL")`, failed),
    formula(`COUNTIF(${caseRange("I")},"NOT RUN")`, cases.length - executed),
    formula(`IF(B${r}=0,0,C${r}/B${r})`, executed ? passed / executed : 0),
    formula(`COUNTA(${defectRange("A")})`, defects.length),
    ...SEVERITIES.map((severity) =>
      formula(
        `COUNTIF(${defectRange("E")},"${severity}")`,
        severityCount(severity),
      ),
    ),
  ];
  overall.height = 26;
  overall.eachCell((cell) => {
    cell.font = { name: "Calibri", size: 14, bold: true };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = BORDER;
  });
  overall.getCell(6).numFmt = "0%";
  paint(overall.getCell(3), COLORS.pass);
  paint(overall.getCell(4), COLORS.fail);
  SEVERITIES.forEach((severity, i) =>
    paint(overall.getCell(8 + i), COLORS[severity]),
  );
  r += 2;

  section("Result by module");
  const moduleHeader = summary.getRow(r);
  moduleHeader.values = [
    "Module",
    "Test cases",
    "Passed",
    "Failed",
    "Not run",
    "Pass rate",
    "Defects",
    ...SEVERITIES,
  ];
  styleHeader(moduleHeader);
  r += 1;
  const firstModuleRow = r;
  for (const moduleName of MODULES) {
    const inModule = cases.filter((c) => c.module === moduleName);
    const moduleDefects = defects.filter((d) => d.module === moduleName);
    const modulePassed = count(inModule, (c) => c.status === "PASS");
    const moduleFailed = count(inModule, (c) => c.status === "FAIL");
    const row = summary.getRow(r);
    row.values = [
      moduleName,
      formula(`COUNTIF(${caseRange("B")},A${r})`, inModule.length),
      formula(
        `COUNTIFS(${caseRange("B")},A${r},${caseRange("I")},"PASS")`,
        modulePassed,
      ),
      formula(
        `COUNTIFS(${caseRange("B")},A${r},${caseRange("I")},"FAIL")`,
        moduleFailed,
      ),
      formula(
        `COUNTIFS(${caseRange("B")},A${r},${caseRange("I")},"NOT RUN")`,
        inModule.length - modulePassed - moduleFailed,
      ),
      formula(
        `IF(C${r}+D${r}=0,0,C${r}/(C${r}+D${r}))`,
        modulePassed + moduleFailed
          ? modulePassed / (modulePassed + moduleFailed)
          : 0,
      ),
      formula(`COUNTIF(${defectRange("B")},A${r})`, moduleDefects.length),
      ...SEVERITIES.map((severity) =>
        formula(
          `COUNTIFS(${defectRange("B")},A${r},${defectRange("E")},"${severity}")`,
          count(moduleDefects, (d) => d.severity === severity),
        ),
      ),
    ];
    row.eachCell((cell, col) => {
      cell.font = { name: "Calibri", size: 11, bold: col === 1 };
      cell.alignment = {
        horizontal: col === 1 ? "left" : "center",
        vertical: "middle",
      };
      cell.border = BORDER;
    });
    row.getCell(6).numFmt = "0%";
    r += 1;
  }
  const totals = summary.getRow(r);
  const sum = (column, result) =>
    formula(`SUM(${column}${firstModuleRow}:${column}${r - 1})`, result);
  totals.values = [
    "Total",
    sum("B", cases.length),
    sum("C", passed),
    sum("D", failed),
    sum("E", cases.length - executed),
    formula(
      `IF(C${r}+D${r}=0,0,C${r}/(C${r}+D${r}))`,
      executed ? passed / executed : 0,
    ),
    sum("G", defects.length),
    ...SEVERITIES.map((severity, i) =>
      sum(String.fromCharCode(72 + i), severityCount(severity)),
    ),
  ];
  totals.eachCell((cell, col) => {
    cell.font = { name: "Calibri", size: 11, bold: true };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: COLORS.subHeader },
    };
    cell.alignment = {
      horizontal: col === 1 ? "left" : "center",
      vertical: "middle",
    };
    cell.border = BORDER;
  });
  totals.getCell(6).numFmt = "0%";
  r += 2;

  const paragraph = (text, height) => {
    summary.mergeCells(r, 1, r, 11);
    const cell = summary.getCell(r, 1);
    cell.value = text;
    cell.alignment = { wrapText: true, vertical: "top" };
    cell.font = { name: "Calibri", size: 11 };
    summary.getRow(r).height =
      height || Math.max(18, Math.ceil(text.length / 150) * 15);
    r += 1;
  };

  section("Assessment");
  paragraph(
    "The core flows work: login and session handling, listing / searching organizations, creating an organization, " +
      "activating and suspending it, editing its details, adding admins, CSV export / template / import validation, " +
      "contacting and approving a sign-up, and composing, sending and viewing an announcement, with the emails " +
      "arriving in the log. Server-side validation is generally thorough and HTML input is escaped or sanitised.",
  );
  paragraph(
    `${defects.length} defects were logged. The build should not be released until the Critical and High items ` +
      "below are fixed: the log viewer exposes every outgoing email (including admin passwords) to anonymous " +
      "visitors, a sign-up cannot be rejected, an organization's plan cannot be changed, and the Add Organization " +
      "form can fail without telling the user why.",
  );
  r += 1;

  section("Critical and High defects (details in 'Defect Log')");
  const topHeader = summary.getRow(r);
  topHeader.values = ["Defect ID", "Severity", "Module"];
  summary.mergeCells(r, 4, r, 11);
  topHeader.getCell(4).value = "Summary";
  styleHeader(topHeader);
  r += 1;
  for (const defect of defects.filter((d) =>
    ["Critical", "High"].includes(d.severity),
  )) {
    const row = summary.getRow(r);
    row.values = [defect.id, defect.severity, defect.module];
    summary.mergeCells(r, 4, r, 11);
    row.getCell(4).value = defect.title;
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      if (col > 11) return;
      cell.border = BORDER;
      cell.alignment = { vertical: "middle", wrapText: true };
      cell.font = { name: "Calibri", size: 11 };
    });
    paint(row.getCell(2), COLORS[defect.severity]);
    row.height = defect.title.length > 95 ? 32 : 20;
    r += 1;
  }
  summary.views = [{ showGridLines: false }];

  // ---------------------------------------------------------------- Scope & Notes
  notesSheet.columns = [{ width: 28 }, { width: 120 }];
  const created = ["active", "pending", "rejected"]
    .map((key) => context[key])
    .filter(Boolean)
    .map((org) => `${org.name} (#${org.id})`);
  const notes = [
    [
      "Scope",
      "Side-menu modules named in the brief: Dashboard, Organization (list, Add Organization, Manage: details / admins / billing, CSV export and import), Sign Up (list, Contact, Review: approve / reject) and Announcements (list, create, details). Login / logout were covered because every module depends on them.",
    ],
    [
      "Out of scope",
      "Tenant (organization) sites, Settings, load / performance testing, and destructive checks on the log viewer (delete was never attempted).",
    ],
    [
      "Approach",
      "1. Exploratory session through every screen and action of the four modules, including negative input, boundary values and the emails each action produces.\n2. Every scenario was then written as an automated Cypress test (cypress/e2e) so the results in this workbook come from an actual run, not from notes.\n3. A test FAILS when the application does not do what the 'Expected Result' column says; each failure is linked to a defect.",
    ],
    [
      "Expected results",
      "No requirements document was provided. Expected results are based on the application's own labels and messages, consistency between screens, and common practice. Items that need a product decision say so in the defect (e.g. BUG-020).",
    ],
    [
      "Severity scale",
      "Critical: security or data exposure, or a module is unusable. High: a main function fails with no workaround, or data shown is wrong. Medium: a function is impaired or misleading but a workaround exists. Low: cosmetic, wording or minor usability.",
    ],
    [
      "Shared environment",
      "Staging is shared with other testers and its data changed during testing (organization count moved from 946 to 950+). Counts quoted in defects are the values seen at the time. Row actions in the automated suite are only ever performed on records the suite created.",
    ],
    [
      "Test data created",
      `Organizations, admins and announcements created by testing are prefixed 'QAMC' and use @mailinator.com addresses. There is no delete function, so they remain on staging.${created.length ? ` This run: ${created.join(", ")}.` : ""}`,
    ],
    [
      "Emails",
      "Staging does not deliver email. Each expected email was looked up in /log-viewer > laravel-{date}.log by recipient / subject.",
    ],
    [
      "Recommended fix order",
      "1. BUG-001 put the log viewer API behind authentication, then rotate anything exposed.\n2. BUG-002 replace emailed predictable passwords with a set-password link.\n3. BUG-003, BUG-004, BUG-005 restore Reject, Domain Prefix error display and Change Plan.\n4. BUG-006, BUG-007, BUG-008 list ordering and the registration / approval emails.\n5. Medium and Low items as scheduled.",
    ],
    [
      "Reproducing this report",
      "npm install, then `npm run cy:run` (full suite, about 12 minutes) and `npm run report`. `npm test` does both.",
    ],
  ];
  notes.forEach(([label, text]) => {
    const row = notesSheet.addRow([label, text]);
    row.getCell(1).font = { name: "Calibri", size: 11, bold: true };
    row.getCell(1).alignment = { vertical: "top" };
    row.getCell(2).alignment = { vertical: "top", wrapText: true };
    row.height = Math.max(
      20,
      text
        .split("\n")
        .reduce((n, line) => n + Math.ceil(line.length / 130), 0) *
        15 +
        4,
    );
  });

  await workbook.xlsx.writeFile(OUTPUT);

  // ---------------------------------------------------------------- console
  console.log(`\n Report written to ${OUTPUT}`);
  console.log(
    ` Test cases: ${cases.length} | executed ${executed} | passed ${passed} | failed ${failed}`,
  );
  console.log(
    ` Defects: ${defects.length} (${SEVERITIES.map((s) => `${s} ${severityCount(s)}`).join(", ")})`,
  );
  console.log(` Evidence screenshots embedded: ${embedded}`);

  const unlinked = cases.filter((c) => c.status === "FAIL" && !c.linked.length);
  if (unlinked.length) {
    console.warn(
      ` Failed tests with no defect: ${unlinked.map((c) => c.id).join(", ")}`,
    );
  }
  const notReproduced = defects.filter(
    (d) => reproduction(d) === "No - re-check",
  );
  if (notReproduced.length) {
    console.warn(
      ` Defects not reproduced in this run: ${notReproduced.map((d) => d.id).join(", ")}`,
    );
  }
  if (executed < cases.length) {
    console.warn(
      ` ${cases.length - executed} test case(s) have no result: run the full suite first.`,
    );
  }
  const unknown = Object.keys(results).filter(
    (id) => !testCases.some((c) => c.id === id),
  );
  if (unknown.length)
    console.warn(` Results without a catalogue entry: ${unknown.join(", ")}`);
}

generateReport().catch((err) => {
  console.error(" Error generating report:", err);
  process.exitCode = 1;
});
