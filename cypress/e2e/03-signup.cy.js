describe("Sign Up system tests", () => {
  beforeEach(() => cy.login());

  it("Sign Up module is accessible", () => {
    cy.openModule("Sign Up");
    cy.contains(/sign\s*up/i).should("be.visible");
  });

  it("Sign Up page has usable form controls", () => {
    cy.openModule("Sign Up");
    cy.get("form").should("exist");
    cy.get("input,select,textarea").should("have.length.greaterThan", 0);
  });

  it("required validation is triggered for empty submission", () => {
    cy.openModule("Sign Up");
    cy.get("form")
      .first()
      .within(() => {
        cy.get("button").filter(":visible").last().click({ force: true });
      });
    cy.get(
      'input:invalid, textarea:invalid, select:invalid, [aria-invalid="true"], .invalid-feedback, .text-danger',
    ).should("exist");
  });

  it("rejects obviously malformed email input where an email field exists", () => {
    cy.openModule("Sign Up");
    cy.get('input[type="email"]')
      .first()
      .then(($email) => {
        if (!$email.length) return;
        cy.wrap($email).clear().type("not-an-email");
        cy.wrap($email).blur();
        cy.get(
          'input[type="email"]:invalid, [aria-invalid="true"], .invalid-feedback, .text-danger',
        ).should("exist");
      });
  });
});
