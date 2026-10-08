describe("Authentication / access baseline", () => {
  it("login page is reachable and exposes credential controls", () => {
    cy.visit("/auth/login");
    cy.get('input[type="email"]').should("be.visible");
    cy.get('input[type="password"]').should("be.visible");
    cy.contains("button", /log\s*in|login|sign\s*in/i).should("be.visible");
  });

  it("valid assessment credentials authenticate successfully", () => {
    cy.login();
    cy.captureObservation({
      test: Cypress.currentTest.title,
      result: "PASS",
      path: cy.state("window")?.location?.pathname,
    });
  });
});
