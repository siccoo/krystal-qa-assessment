describe("Cross-module smoke / network checks", () => {
  beforeEach(() => cy.login());

  it("does not expose an obvious application error on core modules", () => {
    const modules = ["Dashboard", "Organization", "Sign Up", "Announcements"];
    modules.forEach((name) => {
      cy.openModule(name);
      cy.contains(/500|server error|something went wrong/i).should("not.exist");
    });
  });
});
