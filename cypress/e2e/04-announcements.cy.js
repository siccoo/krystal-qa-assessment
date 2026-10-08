describe("Announcements system tests", () => {
  beforeEach(() => cy.login());

  it("Announcements module is accessible", () => {
    cy.openModule("Announcements");
    cy.contains(/announcement/i).should("be.visible");
  });

  it("Announcements page has no obvious fatal error", () => {
    cy.openModule("Announcements");
    cy.contains(/500|server error|something went wrong/i).should("not.exist");
  });

  it("required validation is triggered for an empty form when available", () => {
    cy.openModule("Announcements");
    cy.get("form").then(($forms) => {
      if (!$forms.length) return;
      cy.wrap($forms.first()).within(() => {
        cy.get("button").filter(":visible").last().click({ force: true });
      });
      cy.get(
        'input:invalid, textarea:invalid, select:invalid, [aria-invalid="true"], .invalid-feedback, .text-danger',
      ).should("exist");
    });
  });
});
