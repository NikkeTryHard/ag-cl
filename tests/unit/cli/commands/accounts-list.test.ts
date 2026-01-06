/**
 * Unit tests for accounts-list command
 *
 * Tests the accountsListCommand function.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the logger module before importing
vi.mock("../../../../src/utils/logger.js", () => {
  const mockLogger = {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  return {
    getLogger: vi.fn(() => mockLogger),
    __mockLogger: mockLogger,
  };
});

import { accountsListCommand } from "../../../../src/cli/commands/accounts-list.js";
import { getLogger } from "../../../../src/utils/logger.js";

describe("accountsListCommand", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should log an info message indicating the command is not yet implemented", () => {
    // Execute
    accountsListCommand();

    // Verify - get a fresh reference to ensure the mock is used
    const logger = getLogger();
    expect(logger.info).toHaveBeenCalledWith("accounts list command - to be implemented");
  });

  it("should not throw an error when called", () => {
    // Execute and verify no error
    expect(() => accountsListCommand()).not.toThrow();
  });

  it("should call getLogger to obtain logger instance", () => {
    // Execute
    accountsListCommand();

    // Verify
    expect(getLogger).toHaveBeenCalled();
  });
});
