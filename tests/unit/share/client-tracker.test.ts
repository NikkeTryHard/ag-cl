// tests/unit/share/client-tracker.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { ClientTracker } from "../../../src/share/client-tracker.js";

describe("ClientTracker", () => {
  let tracker: ClientTracker;

  beforeEach(() => {
    vi.useFakeTimers();
    tracker = new ClientTracker(5, 60000); // max 5 clients, 1 min timeout
  });

  it("should register new client", () => {
    const result = tracker.registerClient("abc***", "bob");

    expect(result.success).toBe(true);
    expect(result.clientId).toBeDefined();
    expect(tracker.getConnectedClients()).toHaveLength(1);
  });

  it("should reject when max clients reached", () => {
    for (let i = 0; i < 5; i++) {
      tracker.registerClient(`key${i}***`, `user${i}`);
    }

    const result = tracker.registerClient("extra***", "extra");

    expect(result.success).toBe(false);
    expect(result.error).toContain("max clients");
  });

  it("should update last poll time on poll", () => {
    const { clientId } = tracker.registerClient("abc***", "bob");

    vi.advanceTimersByTime(5000);
    tracker.recordPoll(clientId!);

    const clients = tracker.getConnectedClients();
    expect(clients[0].pollCount).toBe(1);
  });

  it("should disconnect timed out clients", () => {
    tracker.registerClient("abc***", "bob");

    vi.advanceTimersByTime(61000); // past timeout
    tracker.cleanupStaleClients();

    expect(tracker.getConnectedClients()).toHaveLength(0);
  });

  it("should manually disconnect client", () => {
    const { clientId } = tracker.registerClient("abc***", "bob");

    const session = tracker.disconnectClient(clientId!);

    expect(session).toBeDefined();
    expect(session?.disconnectedAt).toBeDefined();
    expect(tracker.getConnectedClients()).toHaveLength(0);
  });
});
