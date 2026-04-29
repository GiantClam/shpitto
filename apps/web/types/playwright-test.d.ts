declare module "@playwright/test" {
  export const expect: any;

  type TestFixtures = {
    page: any;
  };

  type TestFunction = {
    (name: string, fn: (fixtures: TestFixtures) => unknown | Promise<unknown>): void;
    describe(name: string, fn: () => void): void;
  };

  export const test: TestFunction;
}
