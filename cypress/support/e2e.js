import "./commands";

const testCases = require("../../qa/test-cases");

const byId = Object.fromEntries(testCases.map((c) => [c.id, c]));

// Declares a test from the catalogue in qa/test-cases.js so that the spec
// title, the result file and the Excel report all share the same ID and name.
globalThis.tc = (id, fn) => {
  const testCase = byId[id];
  if (!testCase) throw new Error(`Unknown test case ID: ${id}`);
  it(`${id} | ${testCase.title}`, fn);
};

Cypress.on("uncaught:exception", (err) => {
  // Do not automatically fail the run for third-party/UI exceptions.
  // They are captured by the test evidence and should be triaged manually.
  console.warn("Uncaught application exception:", err.message);
  return false;
});

// End-state screenshot of every test, named after its ID. For a failed test
// this is the screen the assertion was looking at, i.e. the defect evidence.
afterEach(function () {
  const [id] = this.currentTest.title.split(" | ");
  cy.screenshot(`evidence/${id.trim()}`, { capture: "viewport", overwrite: true });
});
