/**
 * Unit tests for error classes
 */

import { describe, it, expect } from "vitest";
import { AntigravityError, RateLimitError, AuthError, NoAccountsError, MaxRetriesError, ApiError, isRateLimitError, isAuthError } from "../../src/errors.js";

describe("AntigravityError", () => {
  describe("constructor", () => {
    it("creates error with default values", () => {
      const error = new AntigravityError("Test error", "TEST_CODE");
      expect(error.message).toBe("Test error");
      expect(error.code).toBe("TEST_CODE");
      expect(error.retryable).toBe(false);
      expect(error.metadata).toEqual({});
      expect(error.name).toBe("AntigravityError");
    });

    it("creates error with custom retryable flag", () => {
      const error = new AntigravityError("Test error", "TEST_CODE", true);
      expect(error.retryable).toBe(true);
    });

    it("creates error with custom metadata", () => {
      const metadata = { foo: "bar", count: 42 };
      const error = new AntigravityError("Test error", "TEST_CODE", false, metadata);
      expect(error.metadata).toEqual(metadata);
    });

    it("extends Error class", () => {
      const error = new AntigravityError("Test error", "TEST_CODE");
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe("toJSON", () => {
    it("returns JSON representation with basic fields", () => {
      const error = new AntigravityError("Test error", "TEST_CODE");
      const json = error.toJSON();
      expect(json).toEqual({
        name: "AntigravityError",
        code: "TEST_CODE",
        message: "Test error",
        retryable: false,
      });
    });

    it("includes metadata in JSON representation", () => {
      const error = new AntigravityError("Test error", "TEST_CODE", true, { extra: "data" });
      const json = error.toJSON();
      expect(json).toEqual({
        name: "AntigravityError",
        code: "TEST_CODE",
        message: "Test error",
        retryable: true,
        extra: "data",
      });
    });
  });
});

describe("RateLimitError", () => {
  describe("constructor", () => {
    it("creates error with default values", () => {
      const error = new RateLimitError("Rate limited");
      expect(error.message).toBe("Rate limited");
      expect(error.code).toBe("RATE_LIMITED");
      expect(error.retryable).toBe(true);
      expect(error.resetMs).toBeNull();
      expect(error.accountEmail).toBeNull();
      expect(error.name).toBe("RateLimitError");
    });

    it("creates error with resetMs", () => {
      const error = new RateLimitError("Rate limited", 60000);
      expect(error.resetMs).toBe(60000);
    });

    it("creates error with accountEmail", () => {
      const error = new RateLimitError("Rate limited", null, "test@example.com");
      expect(error.accountEmail).toBe("test@example.com");
    });

    it("creates error with all parameters", () => {
      const error = new RateLimitError("Rate limited", 30000, "user@test.com");
      expect(error.message).toBe("Rate limited");
      expect(error.resetMs).toBe(30000);
      expect(error.accountEmail).toBe("user@test.com");
    });

    it("extends AntigravityError class", () => {
      const error = new RateLimitError("Rate limited");
      expect(error).toBeInstanceOf(AntigravityError);
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe("toJSON", () => {
    it("includes resetMs and accountEmail in JSON", () => {
      const error = new RateLimitError("Rate limited", 60000, "test@example.com");
      const json = error.toJSON();
      expect(json.resetMs).toBe(60000);
      expect(json.accountEmail).toBe("test@example.com");
    });
  });
});

describe("AuthError", () => {
  describe("constructor", () => {
    it("creates error with default values", () => {
      const error = new AuthError("Authentication failed");
      expect(error.message).toBe("Authentication failed");
      expect(error.code).toBe("AUTH_INVALID");
      expect(error.retryable).toBe(false);
      expect(error.accountEmail).toBeNull();
      expect(error.reason).toBeNull();
      expect(error.name).toBe("AuthError");
    });

    it("creates error with accountEmail", () => {
      const error = new AuthError("Auth failed", "test@example.com");
      expect(error.accountEmail).toBe("test@example.com");
    });

    it("creates error with reason", () => {
      const error = new AuthError("Auth failed", null, "token_expired");
      expect(error.reason).toBe("token_expired");
    });

    it("creates error with all parameters", () => {
      const error = new AuthError("Auth failed", "user@test.com", "invalid_grant");
      expect(error.message).toBe("Auth failed");
      expect(error.accountEmail).toBe("user@test.com");
      expect(error.reason).toBe("invalid_grant");
    });

    it("extends AntigravityError class", () => {
      const error = new AuthError("Auth failed");
      expect(error).toBeInstanceOf(AntigravityError);
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe("toJSON", () => {
    it("includes accountEmail and reason in JSON", () => {
      const error = new AuthError("Auth failed", "test@example.com", "token_expired");
      const json = error.toJSON();
      expect(json.accountEmail).toBe("test@example.com");
      expect(json.reason).toBe("token_expired");
    });
  });
});

describe("NoAccountsError", () => {
  describe("constructor", () => {
    it("creates error with default message", () => {
      const error = new NoAccountsError();
      expect(error.message).toBe("No accounts available");
      expect(error.code).toBe("NO_ACCOUNTS");
      expect(error.allRateLimited).toBe(false);
      expect(error.name).toBe("NoAccountsError");
    });

    it("creates error with custom message", () => {
      const error = new NoAccountsError("Custom no accounts message");
      expect(error.message).toBe("Custom no accounts message");
    });

    it("creates error with allRateLimited flag", () => {
      const error = new NoAccountsError("All accounts rate limited", true);
      expect(error.allRateLimited).toBe(true);
      expect(error.retryable).toBe(true);
    });

    it("is not retryable when allRateLimited is false", () => {
      const error = new NoAccountsError("No accounts", false);
      expect(error.retryable).toBe(false);
    });

    it("extends AntigravityError class", () => {
      const error = new NoAccountsError();
      expect(error).toBeInstanceOf(AntigravityError);
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe("toJSON", () => {
    it("includes allRateLimited in JSON", () => {
      const error = new NoAccountsError("No accounts", true);
      const json = error.toJSON();
      expect(json.allRateLimited).toBe(true);
    });
  });
});

describe("MaxRetriesError", () => {
  describe("constructor", () => {
    it("creates error with default values", () => {
      const error = new MaxRetriesError();
      expect(error.message).toBe("Max retries exceeded");
      expect(error.code).toBe("MAX_RETRIES");
      expect(error.retryable).toBe(false);
      expect(error.attempts).toBe(0);
      expect(error.name).toBe("MaxRetriesError");
    });

    it("creates error with custom message", () => {
      const error = new MaxRetriesError("Custom retry message");
      expect(error.message).toBe("Custom retry message");
    });

    it("creates error with attempts count", () => {
      const error = new MaxRetriesError("Max retries", 5);
      expect(error.attempts).toBe(5);
    });

    it("extends AntigravityError class", () => {
      const error = new MaxRetriesError();
      expect(error).toBeInstanceOf(AntigravityError);
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe("toJSON", () => {
    it("includes attempts in JSON", () => {
      const error = new MaxRetriesError("Max retries", 3);
      const json = error.toJSON();
      expect(json.attempts).toBe(3);
    });
  });
});

describe("ApiError", () => {
  describe("constructor", () => {
    it("creates error with default values", () => {
      const error = new ApiError("API error occurred");
      expect(error.message).toBe("API error occurred");
      expect(error.statusCode).toBe(500);
      expect(error.errorType).toBe("api_error");
      expect(error.code).toBe("API_ERROR");
      expect(error.name).toBe("ApiError");
    });

    it("creates error with custom status code", () => {
      const error = new ApiError("Bad request", 400);
      expect(error.statusCode).toBe(400);
    });

    it("creates error with custom error type", () => {
      const error = new ApiError("Invalid", 400, "validation_error");
      expect(error.errorType).toBe("validation_error");
      expect(error.code).toBe("VALIDATION_ERROR");
    });

    it("is retryable for 5xx errors", () => {
      expect(new ApiError("Server error", 500).retryable).toBe(true);
      expect(new ApiError("Bad gateway", 502).retryable).toBe(true);
      expect(new ApiError("Service unavailable", 503).retryable).toBe(true);
    });

    it("is not retryable for 4xx errors", () => {
      expect(new ApiError("Bad request", 400).retryable).toBe(false);
      expect(new ApiError("Unauthorized", 401).retryable).toBe(false);
      expect(new ApiError("Not found", 404).retryable).toBe(false);
    });

    it("extends AntigravityError class", () => {
      const error = new ApiError("API error");
      expect(error).toBeInstanceOf(AntigravityError);
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe("toJSON", () => {
    it("includes statusCode and errorType in JSON", () => {
      const error = new ApiError("API error", 503, "service_unavailable");
      const json = error.toJSON();
      expect(json.statusCode).toBe(503);
      expect(json.errorType).toBe("service_unavailable");
    });
  });
});

describe("isRateLimitError", () => {
  describe("with RateLimitError instances", () => {
    it("returns true for RateLimitError instance", () => {
      const error = new RateLimitError("Rate limited");
      expect(isRateLimitError(error)).toBe(true);
    });
  });

  describe("with plain Error messages", () => {
    it.each(["429 Too Many Requests", "Error: 429", "RESOURCE_EXHAUSTED", "resource_exhausted: quota exceeded", "QUOTA_EXHAUSTED", "quota_exhausted", "Rate limit exceeded", "rate limit reached"])("returns true for error message containing rate limit indicator: '%s'", (message) => {
      expect(isRateLimitError(new Error(message))).toBe(true);
    });

    it.each(["Server error", "Network timeout", "Authentication failed", "Invalid request"])("returns false for non-rate-limit error message: '%s'", (message) => {
      expect(isRateLimitError(new Error(message))).toBe(false);
    });
  });

  describe("with other error types", () => {
    it("returns false for AuthError", () => {
      expect(isRateLimitError(new AuthError("Auth failed"))).toBe(false);
    });

    it("returns false for ApiError without rate limit message", () => {
      expect(isRateLimitError(new ApiError("Server error", 500))).toBe(false);
    });
  });
});

describe("isAuthError", () => {
  describe("with AuthError instances", () => {
    it("returns true for AuthError instance", () => {
      const error = new AuthError("Authentication failed");
      expect(isAuthError(error)).toBe(true);
    });
  });

  describe("with plain Error messages", () => {
    it.each(["AUTH_INVALID", "auth_invalid: token expired", "INVALID_GRANT", "invalid_grant", "TOKEN REFRESH FAILED", "Token refresh failed: expired"])("returns true for error message containing auth indicator: '%s'", (message) => {
      expect(isAuthError(new Error(message))).toBe(true);
    });

    it.each(["Server error", "Rate limited", "Network timeout", "Invalid request"])("returns false for non-auth error message: '%s'", (message) => {
      expect(isAuthError(new Error(message))).toBe(false);
    });
  });

  describe("with other error types", () => {
    it("returns false for RateLimitError", () => {
      expect(isAuthError(new RateLimitError("Rate limited"))).toBe(false);
    });

    it("returns false for ApiError without auth message", () => {
      expect(isAuthError(new ApiError("Server error", 500))).toBe(false);
    });
  });
});
