describe("Dashboard system tests", () => {
  beforeEach(() => cy.login());

  it("dashboard is accessible after login", () => {
    cy.contains(/dashboard/i).should("be.visible");
  });

  it("dashboard renders without a visible fatal error", () => {
    cy.get("body").should("be.visible");
    cy.contains(/500|server error|something went wrong/i).should("not.exist");
  });

  it("dashboard navigation links are usable", () => {
    cy.get('a,button,[role="link"]').then(($els) => {
      expect($els.length, "interactive controls").to.be.greaterThan(0);
    });
  });
});
