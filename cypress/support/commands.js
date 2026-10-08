Cypress.Commands.add("login", (email, password) => {
  const targetEmail =
    email || Cypress.env("QA_EMAIL") || "tester@krystalhr.com";
  const targetPassword = password || Cypress.env("QA_PASSWORD") || "pass0403";

  cy.visit("/auth/login");
  cy.get('input[type="email"]').clear().type(targetEmail);
  cy.get('input[type="password"]').clear().type(targetPassword, { log: false });
  cy.contains("button", /log\s*in|login|sign\s*in/i).click();
  cy.location("pathname", { timeout: 15000 }).should(
    "not.match",
    /\/auth\/login/,
  );
});

Cypress.Commands.add("openModule", (name) => {
  cy.contains(
    'a,button,[role="link"]',
    new RegExp("^\\s*" + name + "\\s*$", "i"),
    { timeout: 10000 },
  )
    .should("be.visible")
    .click();
});

Cypress.Commands.add("captureObservation", (observation) => {
  cy.task("appendFinding", observation);
});
