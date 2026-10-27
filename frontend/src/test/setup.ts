import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Testing Library registers this automatically when globals are enabled, but
// doing it explicitly keeps component tests isolated in every environment.
afterEach(() => {
  cleanup();
});
