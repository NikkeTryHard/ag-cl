// tests/unit/share/middleware.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { createShareAuthMiddleware } from "../../../src/share/middleware.js";
import type { ShareConfig } from "../../../src/share/types.js";
import { getDefaultShareConfig } from "../../../src/share/config-storage.js";

describe("Share auth middleware", () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;
  let jsonMock: ReturnType<typeof vi.fn>;
  let statusMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    jsonMock = vi.fn();
    statusMock = vi.fn(() => ({ json: jsonMock }));
    mockReq = { headers: {} };
    mockRes = { status: statusMock } as Partial<Response>;
    mockNext = vi.fn();
  });

  it("should allow request when auth disabled", () => {
    const config = getDefaultShareConfig();
    config.auth.enabled = false;

    const middleware = createShareAuthMiddleware(() => config);
    middleware(mockReq as Request, mockRes as Response, mockNext);

    expect(mockNext).toHaveBeenCalled();
    expect(statusMock).not.toHaveBeenCalled();
  });

  it("should reject request without API key", () => {
    const config = getDefaultShareConfig();
    config.auth.enabled = true;
    config.auth.masterKey = "secret";

    const middleware = createShareAuthMiddleware(() => config);
    middleware(mockReq as Request, mockRes as Response, mockNext);

    expect(statusMock).toHaveBeenCalledWith(401);
    expect(mockNext).not.toHaveBeenCalled();
  });

  it("should accept valid API key in header", () => {
    const config = getDefaultShareConfig();
    config.auth.enabled = true;
    config.auth.masterKey = "valid-key";

    mockReq.headers = { "x-api-key": "valid-key" };

    const middleware = createShareAuthMiddleware(() => config);
    middleware(mockReq as Request, mockRes as Response, mockNext);

    expect(mockNext).toHaveBeenCalled();
    expect(statusMock).not.toHaveBeenCalled();
  });

  it("should accept valid API key in query param", () => {
    const config = getDefaultShareConfig();
    config.auth.enabled = true;
    config.auth.masterKey = "valid-key";

    mockReq.query = { key: "valid-key" };

    const middleware = createShareAuthMiddleware(() => config);
    middleware(mockReq as Request, mockRes as Response, mockNext);

    expect(mockNext).toHaveBeenCalled();
  });
});
