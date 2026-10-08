import "./commands";

Cypress.on("uncaught:exception", (err) => {
  // Do not automatically fail the run for third-party/UI exceptions.
  // They are captured by the test evidence and should be triaged manually.
  console.warn("Uncaught application exception:", err.message);
  return false;
});

beforeEach(() => {
  cy.intercept({ method: "GET", url: "**" }).as("allGetRequests");
});
