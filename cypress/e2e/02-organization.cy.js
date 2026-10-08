describe("Organization system tests", () => {
  beforeEach(() => cy.login());

  it("Organization module is accessible", () => {
    cy.openModule("Organization");
    cy.contains(/organization/i).should("be.visible");
  });

  it("Organization page has no obvious fatal error", () => {
    cy.openModule("Organization");
    cy.contains(/500|server error|something went wrong/i).should("not.exist");
  });

  it("required fields reject an empty create/update submission when a form is available", () => {
    cy.openModule("Organization");
    cy.get("form").then(($forms) => {
      if (!$forms.length) return;
      cy.wrap($forms.first()).within(() => {
        cy.get("button").filter(":visible").last().click({ force: true });
      });
      cy.get(
        'input:invalid, textarea:invalid, [aria-invalid="true"], .invalid-feedback, .text-danger',
      ).should("exist");
    });
  });
});
