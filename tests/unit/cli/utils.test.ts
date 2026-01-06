/**
 * Unit tests for CLI utils module
 *
 * Tests the isServerRunning utility function including:
 * - Connection success (server running)
 * - Connection error (server not running)
 * - Connection timeout handling
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "events";

// Create a factory function that returns mock socket instances
function createMockSocket(): {
  socket: EventEmitter & {
    setTimeout: ReturnType<typeof vi.fn>;
    connect: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
    simulateConnect: () => void;
    simulateError: (error?: Error) => void;
    simulateTimeout: () => void;
  };
} {
  const socket = new EventEmitter() as EventEmitter & {
    setTimeout: ReturnType<typeof vi.fn>;
    connect: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
    simulateConnect: () => void;
    simulateError: (error?: Error) => void;
    simulateTimeout: () => void;
  };
  socket.setTimeout = vi.fn().mockReturnThis();
  socket.connect = vi.fn().mockReturnThis();
  socket.destroy = vi.fn();
  socket.simulateConnect = () => socket.emit("connect");
  socket.simulateError = (error?: Error) => socket.emit("error", error || new Error("ECONNREFUSED"));
  socket.simulateTimeout = () => socket.emit("timeout");
  return { socket };
}

// Store the current mock socket for tests to access
let currentMockSocket: ReturnType<typeof createMockSocket>["socket"];

// Mock the net module with a class-like constructor
vi.mock("net", () => {
  return {
    default: {
      Socket: class MockSocket extends EventEmitter {
        setTimeout = vi.fn().mockReturnValue(this);
        connect = vi.fn().mockReturnValue(this);
        destroy = vi.fn();

        constructor() {
          super();
          // Store reference for test assertions
          currentMockSocket = this as unknown as ReturnType<typeof createMockSocket>["socket"];
          currentMockSocket.simulateConnect = () => this.emit("connect");
          currentMockSocket.simulateError = (error?: Error) => this.emit("error", error || new Error("ECONNREFUSED"));
          currentMockSocket.simulateTimeout = () => this.emit("timeout");
        }
      },
    },
    Socket: class MockSocket extends EventEmitter {
      setTimeout = vi.fn().mockReturnValue(this);
      connect = vi.fn().mockReturnValue(this);
      destroy = vi.fn();

      constructor() {
        super();
        // Store reference for test assertions
        currentMockSocket = this as unknown as ReturnType<typeof createMockSocket>["socket"];
        currentMockSocket.simulateConnect = () => this.emit("connect");
        currentMockSocket.simulateError = (error?: Error) => this.emit("error", error || new Error("ECONNREFUSED"));
        currentMockSocket.simulateTimeout = () => this.emit("timeout");
      }
    },
  };
});

// Must import after mocks are set up
import { isServerRunning } from "../../../../src/cli/utils.js";

describe("isServerRunning", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Connection success (server running)", () => {
    it("should return true when socket connects successfully", async () => {
      const promise = isServerRunning(8080);

      // Simulate immediate connection
      currentMockSocket.simulateConnect();

      const result = await promise;

      expect(result).toBe(true);
      expect(currentMockSocket.setTimeout).toHaveBeenCalledWith(1000);
      expect(currentMockSocket.connect).toHaveBeenCalledWith(8080, "127.0.0.1");
      expect(currentMockSocket.destroy).toHaveBeenCalled();
    });

    it("should check the correct port", async () => {
      const promise = isServerRunning(3000);

      currentMockSocket.simulateConnect();

      await promise;

      expect(currentMockSocket.connect).toHaveBeenCalledWith(3000, "127.0.0.1");
    });
  });

  describe("Connection error (server not running)", () => {
    it("should return false when socket emits error", async () => {
      const promise = isServerRunning(8080);

      // Simulate connection error
      currentMockSocket.simulateError(new Error("ECONNREFUSED"));

      const result = await promise;

      expect(result).toBe(false);
      expect(currentMockSocket.destroy).toHaveBeenCalled();
    });

    it("should return false for ECONNREFUSED error", async () => {
      const promise = isServerRunning(8080);

      const error = new Error("connect ECONNREFUSED 127.0.0.1:8080");
      currentMockSocket.simulateError(error);

      const result = await promise;

      expect(result).toBe(false);
    });

    it("should return false for ETIMEDOUT error", async () => {
      const promise = isServerRunning(8080);

      const error = new Error("connect ETIMEDOUT");
      currentMockSocket.simulateError(error);

      const result = await promise;

      expect(result).toBe(false);
    });
  });

  describe("Connection timeout handling", () => {
    it("should return false when socket times out", async () => {
      const promise = isServerRunning(8080);

      // Simulate timeout
      currentMockSocket.simulateTimeout();

      const result = await promise;

      expect(result).toBe(false);
      expect(currentMockSocket.destroy).toHaveBeenCalled();
    });

    it("should set timeout to 1000ms", async () => {
      const promise = isServerRunning(8080);

      currentMockSocket.simulateTimeout();

      await promise;

      expect(currentMockSocket.setTimeout).toHaveBeenCalledWith(1000);
    });
  });

  describe("Socket lifecycle", () => {
    it("should destroy socket after successful connection", async () => {
      const promise = isServerRunning(8080);

      currentMockSocket.simulateConnect();

      await promise;

      expect(currentMockSocket.destroy).toHaveBeenCalledTimes(1);
    });

    it("should destroy socket after error", async () => {
      const promise = isServerRunning(8080);

      currentMockSocket.simulateError();

      await promise;

      expect(currentMockSocket.destroy).toHaveBeenCalledTimes(1);
    });

    it("should destroy socket after timeout", async () => {
      const promise = isServerRunning(8080);

      currentMockSocket.simulateTimeout();

      await promise;

      expect(currentMockSocket.destroy).toHaveBeenCalledTimes(1);
    });
  });

  describe("Edge cases", () => {
    it("should handle port 0", async () => {
      const promise = isServerRunning(0);

      currentMockSocket.simulateError();

      const result = await promise;

      expect(result).toBe(false);
      expect(currentMockSocket.connect).toHaveBeenCalledWith(0, "127.0.0.1");
    });

    it("should handle high port numbers", async () => {
      const promise = isServerRunning(65535);

      currentMockSocket.simulateConnect();

      const result = await promise;

      expect(result).toBe(true);
      expect(currentMockSocket.connect).toHaveBeenCalledWith(65535, "127.0.0.1");
    });
  });
});
