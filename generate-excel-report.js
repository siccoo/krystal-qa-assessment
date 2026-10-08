const ExcelJS = require("exceljs");
const fs = require("fs");
const path = require("path");

async function generateFullQAAssessmentReport() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Michael Chilaka";
  workbook.created = new Date();

  const summarySheet = workbook.addWorksheet("Executive Summary");

  summarySheet.columns = [
    { header: "Module Name", key: "module", width: 25 },
    { header: "Test Spec File", key: "spec", width: 30 },
    { header: "Total Executed", key: "total", width: 16 },
    { header: "Passed", key: "passed", width: 12 },
    { header: "Failed / Defects", key: "failed", width: 18 },
    { header: "Module Status", key: "status", width: 18 },
  ];

  const summaryData = [
    {
      module: "Authentication",
      spec: "00-authentication.cy.js",
      total: 2,
      passed: 2,
      failed: 0,
      status: "PASSED",
    },
    {
      module: "Dashboard",
      spec: "01-dashboard.cy.js",
      total: 3,
      passed: 3,
      failed: 0,
      status: "PASSED",
    },
    {
      module: "Organization",
      spec: "02-organization.cy.js",
      total: 3,
      passed: 2,
      failed: 1,
      status: "DEFECTS FOUND",
    },
    {
      module: "Sign Up",
      spec: "03-signup.cy.js",
      total: 4,
      passed: 2,
      failed: 2,
      status: "DEFECTS FOUND",
    },
    {
      module: "Announcements",
      spec: "04-announcements.cy.js",
      total: 3,
      passed: 2,
      failed: 1,
      status: "DEFECTS FOUND",
    },
    {
      module: "Cross-Module Smoke",
      spec: "05-smoke-network.cy.js",
      total: 1,
      passed: 1,
      failed: 0,
      status: "PASSED",
    },
  ];

  summaryData.forEach((row) => summarySheet.addRow(row));

  // Style Executive Summary Headers
  summarySheet.getRow(1).font = {
    name: "Calibri",
    size: 11,
    bold: true,
    color: { argb: "FFFFFF" },
  };
  summarySheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "1F4E78" },
  };
  summarySheet.getRow(1).alignment = {
    vertical: "middle",
    horizontal: "center",
  };

  // Format Status Rows
  summarySheet.eachRow((row, rowNumber) => {
    if (rowNumber > 1) {
      const statusCell = row.getCell("status");
      if (statusCell.value === "PASSED") {
        statusCell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "C6EFCE" },
        };
        statusCell.font = { color: { argb: "006100" }, bold: true };
      } else {
        statusCell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFC7CE" },
        };
        statusCell.font = { color: { argb: "9C0006" }, bold: true };
      }
    }
  });

  const defectSheet = workbook.addWorksheet("Defect Log Matrix");

  defectSheet.columns = [
    { header: "Defect ID", key: "id", width: 12 },
    { header: "Module", key: "module", width: 18 },
    { header: "Bug Summary", key: "summary", width: 35 },
    { header: "Severity", key: "severity", width: 12 },
    { header: "Priority", key: "priority", width: 12 },
    { header: "Steps to Reproduce", key: "steps", width: 45 },
    { header: "Expected Result", key: "expected", width: 35 },
    { header: "Actual Result", key: "actual", width: 35 },
  ];

  const defects = [
    {
      id: "BUG-001",
      module: "Organization",
      summary:
        "Form submission proceeds on empty create/update without triggering native field validations",
      severity: "High",
      priority: "High",
      steps:
        '1. Navigate to Organization module via cy.openModule("Organization").\n2. Click submitting action button inside visible form.\n3. Observe HTML5 required input state assertions.',
      expected:
        'Native HTML5 validation or form error state (.invalid-feedback / [aria-invalid="true"]) should trigger.',
      actual: "Form submits without flagging required empty inputs in the UI.",
    },
    {
      id: "BUG-002",
      module: "Sign Up",
      summary:
        "Sign Up module form submits blank inputs without client-side required field enforcement",
      severity: "High",
      priority: "High",
      steps:
        '1. Open "Sign Up" module.\n2. Click submit button with empty text/select fields.\n3. Assert on required input state.',
      expected:
        "Fields display invalid validation highlight and prevent form progression.",
      actual:
        "Form submission action executes without validating empty inputs.",
    },
    {
      id: "BUG-003",
      module: "Sign Up",
      summary:
        "Malformed email input format bypasses client-side email format validation",
      severity: "Medium",
      priority: "High",
      steps:
        '1. Open "Sign Up" module.\n2. Enter invalid string "not-an-email" into email field.\n3. Trigger input blur or form submission.',
      expected:
        "Email input field raises invalid format flag or warning message.",
      actual:
        "Input accepts malformed email string without displaying field-level validation errors.",
    },
    {
      id: "BUG-004",
      module: "Announcements",
      summary:
        "Announcements creation form lacks mandatory client-side field validation",
      severity: "High",
      priority: "Medium",
      steps:
        '1. Access "Announcements" section.\n2. Attempt submitting an empty announcement creation form.\n3. Check for validation state.',
      expected:
        "Form displays mandatory field errors prior to network request.",
      actual: "No visual validation feedback is given on required inputs.",
    },
  ];

  defects.forEach((defect) => defectSheet.addRow(defect));

  // Style Defect Matrix Headers
  defectSheet.getRow(1).font = {
    name: "Calibri",
    size: 11,
    bold: true,
    color: { argb: "FFFFFF" },
  };
  defectSheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "C00000" },
  };
  defectSheet.getRow(1).alignment = {
    vertical: "middle",
    horizontal: "center",
  };

  // Enable text wrapping across all rows in Defect Matrix
  defectSheet.eachRow((row, rowNumber) => {
    if (rowNumber > 1) {
      row.alignment = { wrapText: true, vertical: "top" };
    }
  });

  const screenshotsDir = path.join(__dirname, "cypress", "screenshots");
  if (fs.existsSync(screenshotsDir)) {
    let imageRowOffset = defects.length + 4;
    const files = fs.readdirSync(screenshotsDir);

    files.forEach((file, index) => {
      if (file.endsWith(".png") || file.endsWith(".jpg")) {
        const imageId = workbook.addImage({
          filename: path.join(screenshotsDir, file),
          extension: file.endsWith(".jpg") ? "jpeg" : "png",
        });

        defectSheet.addImage(imageId, {
          tl: { col: 1, row: imageRowOffset + index * 12 },
          ext: { width: 450, height: 250 },
        });
      }
    });
  }

  const outputPath = path.join(
    __dirname,
    "KrystalHR_QA_Assessment_Report.xlsx",
  );
  await workbook.xlsx.writeFile(outputPath);
  console.log(
    `\n Full assessment report with Executive Summary & Defect Matrix generated:`,
  );
  console.log(` Location: ${outputPath}\n`);
}

generateFullQAAssessmentReport().catch((err) => {
  console.error(" Error generating report:", err);
});
