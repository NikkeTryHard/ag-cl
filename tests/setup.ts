/**
 * Global Test Setup
 *
 * Configures common mocks and cleanup for all tests.
 */

import { vi, beforeEach, afterEach } from "vitest";

// Create mock logger instance for all tests
const mockLoggerInstance = {
  info: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  trace: vi.fn(),
  fatal: vi.fn(),
  child: vi.fn().mockReturnThis(),
  level: "info",
  isLevelEnabled: vi.fn().mockReturnValue(true),
};

// Suppress logger output in all tests by mocking Pino-based logger
vi.mock("../src/utils/logger.js", () => ({
  getLogger: vi.fn(() => mockLoggerInstance),
  initLogger: vi.fn(),
  setLogLevel: vi.fn((level: string) => {
    mockLoggerInstance.level = level;
  }),
}));

// Reset mocks between tests
beforeEach(() => {
  vi.clearAllMocks();
  mockLoggerInstance.level = "info";
});

// Ensure real timers are restored after each test
afterEach(() => {
  vi.useRealTimers();
});
