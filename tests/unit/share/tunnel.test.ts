// tests/unit/share/tunnel.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TunnelManager, checkCloudflaredInstalled } from "../../../src/share/tunnel.js";
import { spawn } from "child_process";
import { EventEmitter } from "events";

vi.mock("child_process");

describe("TunnelManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("checkCloudflaredInstalled", () => {
    it("should return true when cloudflared is found", async () => {
      const mockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();

      vi.mocked(spawn).mockReturnValue(mockProcess);

      const promise = checkCloudflaredInstalled();
      mockProcess.emit("close", 0);

      const result = await promise;
      expect(result).toBe(true);
    });

    it("should return false when cloudflared not found", async () => {
      const mockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();

      vi.mocked(spawn).mockReturnValue(mockProcess);

      const promise = checkCloudflaredInstalled();
      mockProcess.emit("error", new Error("ENOENT"));

      const result = await promise;
      expect(result).toBe(false);
    });
  });

  describe("TunnelManager", () => {
    it("should emit url event when tunnel starts", async () => {
      const mockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      mockProcess.kill = vi.fn();

      vi.mocked(spawn).mockReturnValue(mockProcess);

      const manager = new TunnelManager(8080);
      const urlPromise = new Promise<string>((resolve) => {
        manager.on("url", resolve);
      });

      manager.start();

      // Simulate cloudflared output with URL
      mockProcess.stderr.emit("data", Buffer.from("INF | https://random-words.trycloudflare.com"));

      const url = await urlPromise;
      expect(url).toBe("https://random-words.trycloudflare.com");
    });

    it("should emit error on process failure", async () => {
      const mockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      mockProcess.kill = vi.fn();

      vi.mocked(spawn).mockReturnValue(mockProcess);

      const manager = new TunnelManager(8080);
      const errorPromise = new Promise<Error>((resolve) => {
        manager.on("error", resolve);
      });

      manager.start();
      mockProcess.emit("error", new Error("spawn failed"));

      const error = await errorPromise;
      expect(error.message).toContain("spawn failed");
    });

    it("should kill process on stop", () => {
      const mockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      mockProcess.kill = vi.fn();

      vi.mocked(spawn).mockReturnValue(mockProcess);

      const manager = new TunnelManager(8080);
      manager.start();
      manager.stop();

      expect(mockProcess.kill).toHaveBeenCalled();
    });
  });

  describe("TunnelManager configuration", () => {
    it("accepts port as number for backward compatibility", () => {
      const tunnel = new TunnelManager(3000);
      expect(tunnel).toBeDefined();
    });

    it("accepts options object with custom values", () => {
      const tunnel = new TunnelManager({
        port: 3000,
        maxReconnectAttempts: 10,
        baseReconnectDelayMs: 500,
        maxReconnectDelayMs: 60000,
      });
      expect(tunnel).toBeDefined();
    });
  });
});
