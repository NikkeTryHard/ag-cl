# Share Mode Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a Share Mode feature that enables users to share their quota dashboard with friends via Cloudflare quick tunnels or local network.

**Architecture:** Three-layer system: (1) Share config/API key management persisted to `~/.config/ag-cl/share-config.json`, (2) Express endpoints for share data under `/share/*`, (3) TUI components for host mode (sharing toggle, client list) and client mode (remote dashboard view). Cloudflare tunnel integration via `cloudflared` subprocess.

**Tech Stack:** Express.js, Ink/React TUI, `cloudflared` CLI, node:child_process, uuid for API keys

---

## Phase 1: Core Infrastructure

### Task 1: Share Config Types

**Files:**

- Create: `src/share/types.ts`
- Test: `tests/unit/share/types.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/unit/share/types.test.ts
import { describe, it, expect } from "vitest";
import type { ShareConfig, FriendKey, ShareVisibility, ShareLimits, AuthMode } from "../../src/share/types.js";

describe("ShareConfig types", () => {
  it("should allow valid ShareConfig structure", () => {
    const config: ShareConfig = {
      auth: {
        enabled: true,
        mode: "single",
        masterKey: "test-key-123",
        friendKeys: [],
      },
      visibility: {
        showAccountEmails: false,
        showIndividualAccounts: true,
        showModelBreakdown: true,
        showBurnRate: false,
      },
      limits: {
        maxClients: 5,
        pollIntervalSeconds: 10,
      },
      persistence: {
        resumeOnRestart: false,
      },
    };

    expect(config.auth.mode).toBe("single");
    expect(config.limits.maxClients).toBe(5);
  });

  it("should allow per-friend auth mode", () => {
    const config: ShareConfig = {
      auth: {
        enabled: true,
        mode: "per-friend",
        masterKey: null,
        friendKeys: [{ key: "abc123", nickname: "bob", revoked: false, createdAt: Date.now() }],
      },
      visibility: {
        showAccountEmails: false,
        showIndividualAccounts: true,
        showModelBreakdown: true,
        showBurnRate: false,
      },
      limits: {
        maxClients: 5,
        pollIntervalSeconds: 10,
      },
      persistence: {
        resumeOnRestart: false,
      },
    };

    expect(config.auth.mode).toBe("per-friend");
    expect(config.auth.friendKeys[0].nickname).toBe("bob");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/share/types.test.ts`
Expected: FAIL with "Cannot find module"

**Step 3: Write minimal implementation**

```typescript
// src/share/types.ts
/**
 * Share Mode Type Definitions
 */

/** Authentication mode for share access */
export type AuthMode = "single" | "per-friend";

/** Friend API key entry */
export interface FriendKey {
  key: string;
  nickname: string | null;
  revoked: boolean;
  createdAt: number;
}

/** Authentication configuration */
export interface ShareAuth {
  enabled: boolean;
  mode: AuthMode;
  masterKey: string | null;
  friendKeys: FriendKey[];
}

/** Visibility configuration - what clients can see */
export interface ShareVisibility {
  showAccountEmails: boolean;
  showIndividualAccounts: boolean;
  showModelBreakdown: boolean;
  showBurnRate: boolean;
}

/** Connection limits */
export interface ShareLimits {
  maxClients: number;
  pollIntervalSeconds: number;
}

/** Persistence settings */
export interface SharePersistence {
  resumeOnRestart: boolean;
}

/** Complete share configuration */
export interface ShareConfig {
  auth: ShareAuth;
  visibility: ShareVisibility;
  limits: ShareLimits;
  persistence: SharePersistence;
}

/** Connected client info */
export interface ConnectedClient {
  id: string;
  key: string; // masked key like "abc***"
  nickname: string | null;
  connectedAt: number;
  lastPollAt: number;
  pollCount: number;
}

/** Session log entry */
export interface SessionLogEntry {
  clientId: string;
  keyMasked: string;
  nickname: string | null;
  connectedAt: number;
  disconnectedAt: number | null;
  pollCount: number;
}

/** Share mode state */
export type ShareMode = "normal" | "host" | "client";

/** Host state for TUI */
export interface ShareHostState {
  active: boolean;
  tunnelUrl: string | null;
  connectedClients: ConnectedClient[];
  error: string | null;
}

/** Client state for TUI */
export interface ShareClientState {
  connected: boolean;
  remoteUrl: string | null;
  hostNickname: string | null;
  error: string | null;
  reconnecting: boolean;
  lastPollAt: number | null;
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/share/types.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/share/types.ts tests/unit/share/types.test.ts
git commit -m "$(cat <<'EOF'
feat(share): add type definitions for share mode

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Share Config Storage

**Files:**

- Create: `src/share/config-storage.ts`
- Test: `tests/unit/share/config-storage.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/unit/share/config-storage.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { loadShareConfig, saveShareConfig, getDefaultShareConfig } from "../../src/share/config-storage.js";

describe("ShareConfig storage", () => {
  let tempDir: string;
  let configPath: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "share-config-test-"));
    configPath = join(tempDir, "share-config.json");
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("should return default config when file does not exist", async () => {
    const config = await loadShareConfig(configPath);
    expect(config.auth.enabled).toBe(true);
    expect(config.auth.mode).toBe("single");
    expect(config.limits.maxClients).toBe(5);
  });

  it("should save and load config", async () => {
    const config = getDefaultShareConfig();
    config.limits.maxClients = 10;
    config.auth.masterKey = "test-key";

    await saveShareConfig(configPath, config);
    const loaded = await loadShareConfig(configPath);

    expect(loaded.limits.maxClients).toBe(10);
    expect(loaded.auth.masterKey).toBe("test-key");
  });

  it("should generate masterKey if null on first save", async () => {
    const config = getDefaultShareConfig();
    expect(config.auth.masterKey).toBeNull();

    await saveShareConfig(configPath, config);
    const loaded = await loadShareConfig(configPath);

    expect(loaded.auth.masterKey).not.toBeNull();
    expect(loaded.auth.masterKey).toHaveLength(36); // UUID length
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/share/config-storage.test.ts`
Expected: FAIL with "Cannot find module"

**Step 3: Write minimal implementation**

```typescript
// src/share/config-storage.ts
/**
 * Share Config Storage
 *
 * Loads and persists share mode configuration.
 */

import { readFile, writeFile, mkdir } from "fs/promises";
import { dirname } from "path";
import { randomUUID } from "crypto";
import type { ShareConfig } from "./types.js";

/**
 * Default share configuration
 */
export function getDefaultShareConfig(): ShareConfig {
  return {
    auth: {
      enabled: true,
      mode: "single",
      masterKey: null,
      friendKeys: [],
    },
    visibility: {
      showAccountEmails: false,
      showIndividualAccounts: true,
      showModelBreakdown: true,
      showBurnRate: false,
    },
    limits: {
      maxClients: 5,
      pollIntervalSeconds: 10,
    },
    persistence: {
      resumeOnRestart: false,
    },
  };
}

/**
 * Load share config from disk
 */
export async function loadShareConfig(path: string): Promise<ShareConfig> {
  try {
    const content = await readFile(path, "utf-8");
    const parsed = JSON.parse(content) as Partial<ShareConfig>;

    // Merge with defaults to ensure all fields exist
    const defaults = getDefaultShareConfig();
    return {
      auth: { ...defaults.auth, ...parsed.auth },
      visibility: { ...defaults.visibility, ...parsed.visibility },
      limits: { ...defaults.limits, ...parsed.limits },
      persistence: { ...defaults.persistence, ...parsed.persistence },
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return getDefaultShareConfig();
    }
    throw error;
  }
}

/**
 * Save share config to disk
 */
export async function saveShareConfig(path: string, config: ShareConfig): Promise<void> {
  // Generate masterKey if null and mode is single
  if (config.auth.mode === "single" && config.auth.masterKey === null) {
    config.auth.masterKey = randomUUID();
  }

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(config, null, 2), "utf-8");
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/share/config-storage.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/share/config-storage.ts tests/unit/share/config-storage.test.ts
git commit -m "$(cat <<'EOF'
feat(share): add config storage with defaults

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: API Key Validation

**Files:**

- Create: `src/share/api-key.ts`
- Test: `tests/unit/share/api-key.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/unit/share/api-key.test.ts
import { describe, it, expect } from "vitest";
import { generateApiKey, maskApiKey, validateApiKey, generateFriendKey } from "../../src/share/api-key.js";
import type { ShareConfig } from "../../src/share/types.js";
import { getDefaultShareConfig } from "../../src/share/config-storage.js";

describe("API key utilities", () => {
  it("should generate valid UUID key", () => {
    const key = generateApiKey();
    expect(key).toHaveLength(36);
    expect(key).toMatch(/^[a-f0-9-]+$/);
  });

  it("should mask key correctly", () => {
    const masked = maskApiKey("abc123def456");
    expect(masked).toBe("abc***");
  });

  it("should mask short keys", () => {
    const masked = maskApiKey("ab");
    expect(masked).toBe("ab***");
  });

  describe("validateApiKey", () => {
    it("should return true when auth disabled", () => {
      const config = getDefaultShareConfig();
      config.auth.enabled = false;

      const result = validateApiKey(config, "any-key");
      expect(result.valid).toBe(true);
    });

    it("should validate master key in single mode", () => {
      const config = getDefaultShareConfig();
      config.auth.mode = "single";
      config.auth.masterKey = "correct-key";

      expect(validateApiKey(config, "correct-key").valid).toBe(true);
      expect(validateApiKey(config, "wrong-key").valid).toBe(false);
    });

    it("should validate friend keys in per-friend mode", () => {
      const config = getDefaultShareConfig();
      config.auth.mode = "per-friend";
      config.auth.friendKeys = [
        { key: "friend-key-1", nickname: "bob", revoked: false, createdAt: Date.now() },
        { key: "friend-key-2", nickname: "alice", revoked: true, createdAt: Date.now() },
      ];

      const bobResult = validateApiKey(config, "friend-key-1");
      expect(bobResult.valid).toBe(true);
      expect(bobResult.nickname).toBe("bob");

      // Revoked key should fail
      expect(validateApiKey(config, "friend-key-2").valid).toBe(false);

      // Unknown key should fail
      expect(validateApiKey(config, "unknown-key").valid).toBe(false);
    });
  });

  it("should generate friend key entry", () => {
    const entry = generateFriendKey("charlie");
    expect(entry.key).toHaveLength(36);
    expect(entry.nickname).toBe("charlie");
    expect(entry.revoked).toBe(false);
    expect(entry.createdAt).toBeGreaterThan(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/share/api-key.test.ts`
Expected: FAIL with "Cannot find module"

**Step 3: Write minimal implementation**

```typescript
// src/share/api-key.ts
/**
 * API Key Management
 *
 * Generate, validate, and mask API keys for share mode.
 */

import { randomUUID } from "crypto";
import type { ShareConfig, FriendKey } from "./types.js";

/**
 * Generate a new API key (UUID v4)
 */
export function generateApiKey(): string {
  return randomUUID();
}

/**
 * Mask an API key for display (show first 3 chars + ***)
 */
export function maskApiKey(key: string): string {
  const prefix = key.slice(0, 3);
  return `${prefix}***`;
}

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  nickname: string | null;
  keyMasked: string | null;
}

/**
 * Validate an API key against the share config
 */
export function validateApiKey(config: ShareConfig, key: string | null | undefined): ValidationResult {
  // Auth disabled = always valid
  if (!config.auth.enabled) {
    return { valid: true, nickname: null, keyMasked: null };
  }

  // No key provided
  if (!key) {
    return { valid: false, nickname: null, keyMasked: null };
  }

  // Single mode - check master key
  if (config.auth.mode === "single") {
    if (config.auth.masterKey === key) {
      return { valid: true, nickname: null, keyMasked: maskApiKey(key) };
    }
    return { valid: false, nickname: null, keyMasked: null };
  }

  // Per-friend mode - check friend keys
  const friendKey = config.auth.friendKeys.find((fk) => fk.key === key && !fk.revoked);
  if (friendKey) {
    return {
      valid: true,
      nickname: friendKey.nickname,
      keyMasked: maskApiKey(key),
    };
  }

  return { valid: false, nickname: null, keyMasked: null };
}

/**
 * Generate a new friend key entry
 */
export function generateFriendKey(nickname: string | null): FriendKey {
  return {
    key: generateApiKey(),
    nickname,
    revoked: false,
    createdAt: Date.now(),
  };
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/share/api-key.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/share/api-key.ts tests/unit/share/api-key.test.ts
git commit -m "$(cat <<'EOF'
feat(share): add API key generation and validation

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Share Constants

**Files:**

- Modify: `src/constants.ts`
- Test: `tests/unit/share/constants.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/unit/share/constants.test.ts
import { describe, it, expect } from "vitest";
import { SHARE_CONFIG_PATH, SHARE_SESSION_LOG_PATH } from "../../src/constants.js";
import { homedir } from "os";

describe("Share constants", () => {
  it("should have share config path in user config dir", () => {
    expect(SHARE_CONFIG_PATH).toContain(homedir());
    expect(SHARE_CONFIG_PATH).toContain("share-config.json");
  });

  it("should have session log path in user config dir", () => {
    expect(SHARE_SESSION_LOG_PATH).toContain(homedir());
    expect(SHARE_SESSION_LOG_PATH).toContain("share-sessions.log");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/share/constants.test.ts`
Expected: FAIL with "does not provide an export named"

**Step 3: Write minimal implementation**

Add to `src/constants.ts` after line 84 (after ACCOUNT_CONFIG_PATH):

```typescript
// Share mode configuration
export const SHARE_CONFIG_PATH = join(homedir(), ".config/ag-cl/share-config.json");
export const SHARE_SESSION_LOG_PATH = join(homedir(), ".config/ag-cl/share-sessions.log");

// Share mode defaults
export const DEFAULT_SHARE_POLL_INTERVAL_SECONDS = 10;
export const DEFAULT_SHARE_MAX_CLIENTS = 5;
export const SHARE_CLIENT_TIMEOUT_MS = 60000; // 1 minute without poll = disconnected
```

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/share/constants.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/constants.ts tests/unit/share/constants.test.ts
git commit -m "$(cat <<'EOF'
feat(share): add share mode constants

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Phase 2: Server Endpoints

### Task 5: Share Middleware (API Key Auth)

**Files:**

- Create: `src/share/middleware.ts`
- Test: `tests/unit/share/middleware.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/unit/share/middleware.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { createShareAuthMiddleware } from "../../src/share/middleware.js";
import type { ShareConfig } from "../../src/share/types.js";
import { getDefaultShareConfig } from "../../src/share/config-storage.js";

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
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/share/middleware.test.ts`
Expected: FAIL with "Cannot find module"

**Step 3: Write minimal implementation**

```typescript
// src/share/middleware.ts
/**
 * Share Mode Middleware
 *
 * Express middleware for API key authentication on share endpoints.
 */

import type { Request, Response, NextFunction } from "express";
import { validateApiKey } from "./api-key.js";
import type { ShareConfig } from "./types.js";

/**
 * Extended request with share auth info
 */
export interface ShareAuthRequest extends Request {
  shareAuth?: {
    nickname: string | null;
    keyMasked: string | null;
  };
}

/**
 * Create share auth middleware
 * @param getConfig - Function to get current share config
 */
export function createShareAuthMiddleware(getConfig: () => ShareConfig): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction) => {
    const config = getConfig();

    // Get API key from header or query param
    const apiKey = (req.headers["x-api-key"] as string | undefined) || (req.query?.key as string | undefined);

    const result = validateApiKey(config, apiKey);

    if (!result.valid) {
      res.status(401).json({
        error: "Unauthorized",
        message: config.auth.enabled ? "Valid API key required" : "Authentication failed",
      });
      return;
    }

    // Attach auth info to request
    (req as ShareAuthRequest).shareAuth = {
      nickname: result.nickname,
      keyMasked: result.keyMasked,
    };

    next();
  };
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/share/middleware.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/share/middleware.ts tests/unit/share/middleware.test.ts
git commit -m "$(cat <<'EOF'
feat(share): add API key auth middleware

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Quota Filter (Visibility)

**Files:**

- Create: `src/share/quota-filter.ts`
- Test: `tests/unit/share/quota-filter.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/unit/share/quota-filter.test.ts
import { describe, it, expect } from "vitest";
import { filterQuotaData } from "../../src/share/quota-filter.js";
import type { ShareVisibility } from "../../src/share/types.js";
import type { AccountCapacityInfo, AggregatedCapacity } from "../../src/tui/types.js";

describe("Quota filter", () => {
  const mockAccounts: AccountCapacityInfo[] = [
    {
      email: "user@example.com",
      tier: "pro",
      claudeModels: [{ name: "sonnet", percentage: 80, resetTime: null }],
      geminiProModels: [],
      geminiFlashModels: [],
      claudeReset: null,
      geminiProReset: null,
      geminiFlashReset: null,
      error: null,
    },
  ];

  const mockClaude: AggregatedCapacity = {
    family: "claude",
    totalPercentage: 80,
    accountCount: 1,
    status: "stable",
    hoursToExhaustion: null,
    ratePerHour: null,
  };

  const mockGemini: AggregatedCapacity = {
    family: "gemini",
    totalPercentage: 60,
    accountCount: 1,
    status: "stable",
    hoursToExhaustion: null,
    ratePerHour: null,
  };

  it("should hide emails when showAccountEmails is false", () => {
    const visibility: ShareVisibility = {
      showAccountEmails: false,
      showIndividualAccounts: true,
      showModelBreakdown: true,
      showBurnRate: true,
    };

    const result = filterQuotaData(mockAccounts, mockClaude, mockGemini, visibility);

    expect(result.accounts?.[0].email).toBe("Account 1");
  });

  it("should hide individual accounts when showIndividualAccounts is false", () => {
    const visibility: ShareVisibility = {
      showAccountEmails: true,
      showIndividualAccounts: false,
      showModelBreakdown: true,
      showBurnRate: true,
    };

    const result = filterQuotaData(mockAccounts, mockClaude, mockGemini, visibility);

    expect(result.accounts).toBeUndefined();
  });

  it("should hide burn rate when showBurnRate is false", () => {
    const visibility: ShareVisibility = {
      showAccountEmails: true,
      showIndividualAccounts: true,
      showModelBreakdown: true,
      showBurnRate: false,
    };

    const result = filterQuotaData(mockAccounts, mockClaude, mockGemini, visibility);

    expect(result.claude.ratePerHour).toBeNull();
    expect(result.claude.hoursToExhaustion).toBeNull();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/share/quota-filter.test.ts`
Expected: FAIL with "Cannot find module"

**Step 3: Write minimal implementation**

```typescript
// src/share/quota-filter.ts
/**
 * Quota Data Filter
 *
 * Filters quota data based on visibility settings.
 */

import type { ShareVisibility } from "./types.js";
import type { AccountCapacityInfo, AggregatedCapacity } from "../tui/types.js";

/**
 * Filtered quota data for sharing
 */
export interface FilteredQuotaData {
  claude: {
    totalPercentage: number;
    accountCount: number;
    status: string;
    hoursToExhaustion: number | null;
    ratePerHour: number | null;
  };
  gemini: {
    totalPercentage: number;
    accountCount: number;
    status: string;
    hoursToExhaustion: number | null;
    ratePerHour: number | null;
  };
  accounts?: Array<{
    email: string;
    tier: string;
    claudeModels?: Array<{ name: string; percentage: number }>;
    geminiModels?: Array<{ name: string; percentage: number }>;
  }>;
  timestamp: string;
}

/**
 * Filter quota data based on visibility settings
 */
export function filterQuotaData(accounts: AccountCapacityInfo[], claudeCapacity: AggregatedCapacity, geminiCapacity: AggregatedCapacity, visibility: ShareVisibility): FilteredQuotaData {
  const result: FilteredQuotaData = {
    claude: {
      totalPercentage: claudeCapacity.totalPercentage,
      accountCount: claudeCapacity.accountCount,
      status: claudeCapacity.status,
      hoursToExhaustion: visibility.showBurnRate ? claudeCapacity.hoursToExhaustion : null,
      ratePerHour: visibility.showBurnRate ? claudeCapacity.ratePerHour : null,
    },
    gemini: {
      totalPercentage: geminiCapacity.totalPercentage,
      accountCount: geminiCapacity.accountCount,
      status: geminiCapacity.status,
      hoursToExhaustion: visibility.showBurnRate ? geminiCapacity.hoursToExhaustion : null,
      ratePerHour: visibility.showBurnRate ? geminiCapacity.ratePerHour : null,
    },
    timestamp: new Date().toISOString(),
  };

  // Add individual accounts if enabled
  if (visibility.showIndividualAccounts) {
    result.accounts = accounts.map((acc, index) => {
      const filtered: FilteredQuotaData["accounts"][0] = {
        email: visibility.showAccountEmails ? acc.email : `Account ${index + 1}`,
        tier: acc.tier,
      };

      if (visibility.showModelBreakdown) {
        filtered.claudeModels = acc.claudeModels.map((m) => ({
          name: m.name,
          percentage: m.percentage,
        }));
        filtered.geminiModels = [...acc.geminiProModels.map((m) => ({ name: m.name, percentage: m.percentage })), ...acc.geminiFlashModels.map((m) => ({ name: m.name, percentage: m.percentage }))];
      }

      return filtered;
    });
  }

  return result;
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/share/quota-filter.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/share/quota-filter.ts tests/unit/share/quota-filter.test.ts
git commit -m "$(cat <<'EOF'
feat(share): add quota data filtering by visibility

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Client Tracker

**Files:**

- Create: `src/share/client-tracker.ts`
- Test: `tests/unit/share/client-tracker.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/unit/share/client-tracker.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { ClientTracker } from "../../src/share/client-tracker.js";

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
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/share/client-tracker.test.ts`
Expected: FAIL with "Cannot find module"

**Step 3: Write minimal implementation**

```typescript
// src/share/client-tracker.ts
/**
 * Client Tracker
 *
 * Tracks connected share clients and their activity.
 */

import { randomUUID } from "crypto";
import type { ConnectedClient, SessionLogEntry } from "./types.js";

export interface RegisterResult {
  success: boolean;
  clientId?: string;
  error?: string;
}

export class ClientTracker {
  private clients: Map<string, ConnectedClient> = new Map();
  private maxClients: number;
  private timeoutMs: number;
  private sessionLog: SessionLogEntry[] = [];

  constructor(maxClients: number, timeoutMs: number) {
    this.maxClients = maxClients;
    this.timeoutMs = timeoutMs;
  }

  /**
   * Register a new client connection
   */
  registerClient(keyMasked: string, nickname: string | null): RegisterResult {
    if (this.clients.size >= this.maxClients) {
      return {
        success: false,
        error: `Connection rejected: max clients (${this.maxClients}) reached`,
      };
    }

    const clientId = randomUUID();
    const now = Date.now();

    this.clients.set(clientId, {
      id: clientId,
      key: keyMasked,
      nickname,
      connectedAt: now,
      lastPollAt: now,
      pollCount: 0,
    });

    return { success: true, clientId };
  }

  /**
   * Record a poll from a client
   */
  recordPoll(clientId: string): boolean {
    const client = this.clients.get(clientId);
    if (!client) return false;

    client.lastPollAt = Date.now();
    client.pollCount++;
    return true;
  }

  /**
   * Get all connected clients
   */
  getConnectedClients(): ConnectedClient[] {
    return Array.from(this.clients.values());
  }

  /**
   * Disconnect a client and return session log entry
   */
  disconnectClient(clientId: string): SessionLogEntry | null {
    const client = this.clients.get(clientId);
    if (!client) return null;

    this.clients.delete(clientId);

    const entry: SessionLogEntry = {
      clientId: client.id,
      keyMasked: client.key,
      nickname: client.nickname,
      connectedAt: client.connectedAt,
      disconnectedAt: Date.now(),
      pollCount: client.pollCount,
    };

    this.sessionLog.push(entry);
    return entry;
  }

  /**
   * Clean up clients that haven't polled within timeout
   */
  cleanupStaleClients(): SessionLogEntry[] {
    const now = Date.now();
    const stale: string[] = [];

    for (const [id, client] of this.clients) {
      if (now - client.lastPollAt > this.timeoutMs) {
        stale.push(id);
      }
    }

    return stale.map((id) => this.disconnectClient(id)!);
  }

  /**
   * Get session log
   */
  getSessionLog(): SessionLogEntry[] {
    return [...this.sessionLog];
  }

  /**
   * Update max clients limit
   */
  setMaxClients(max: number): void {
    this.maxClients = max;
  }

  /**
   * Disconnect all clients
   */
  disconnectAll(): SessionLogEntry[] {
    const entries: SessionLogEntry[] = [];
    for (const id of this.clients.keys()) {
      const entry = this.disconnectClient(id);
      if (entry) entries.push(entry);
    }
    return entries;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/share/client-tracker.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/share/client-tracker.ts tests/unit/share/client-tracker.test.ts
git commit -m "$(cat <<'EOF'
feat(share): add client connection tracker

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Share Router

**Files:**

- Create: `src/share/router.ts`
- Test: `tests/unit/share/router.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/unit/share/router.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import express from "express";
import { createShareRouter } from "../../src/share/router.js";
import { getDefaultShareConfig } from "../../src/share/config-storage.js";
import type { ShareConfig } from "../../src/share/types.js";

describe("Share router", () => {
  let app: express.Application;
  let config: ShareConfig;

  const mockQuotaProvider = () => ({
    accounts: [],
    claudeCapacity: {
      family: "claude" as const,
      totalPercentage: 80,
      accountCount: 1,
      status: "stable" as const,
      hoursToExhaustion: null,
      ratePerHour: null,
    },
    geminiCapacity: {
      family: "gemini" as const,
      totalPercentage: 60,
      accountCount: 1,
      status: "stable" as const,
      hoursToExhaustion: null,
      ratePerHour: null,
    },
  });

  beforeEach(() => {
    config = getDefaultShareConfig();
    config.auth.enabled = false; // Disable auth for easier testing

    app = express();
    app.use(express.json());
    app.use(
      "/share",
      createShareRouter({
        getConfig: () => config,
        getQuotaData: mockQuotaProvider,
      }),
    );
  });

  it("GET /share/status should return health", async () => {
    const res = await request(app).get("/share/status");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });

  it("GET /share/quota should return filtered quota data", async () => {
    const res = await request(app).get("/share/quota");

    expect(res.status).toBe(200);
    expect(res.body.claude).toBeDefined();
    expect(res.body.gemini).toBeDefined();
    expect(res.body.timestamp).toBeDefined();
  });

  it("POST /share/register should register client", async () => {
    const res = await request(app).post("/share/register").send({ nickname: "test-user" });

    expect(res.status).toBe(200);
    expect(res.body.clientId).toBeDefined();
    expect(res.body.pollInterval).toBeDefined();
  });

  it("GET /share/quota with clientId should record poll", async () => {
    // First register
    const regRes = await request(app).post("/share/register").send({ nickname: "test-user" });
    const { clientId } = regRes.body;

    // Then poll
    const pollRes = await request(app).get("/share/quota").set("x-client-id", clientId);

    expect(pollRes.status).toBe(200);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/share/router.test.ts`
Expected: FAIL with "Cannot find module"

**Step 3: Write minimal implementation**

```typescript
// src/share/router.ts
/**
 * Share Router
 *
 * Express router for share mode endpoints.
 */

import { Router, type Request, type Response } from "express";
import { createShareAuthMiddleware, type ShareAuthRequest } from "./middleware.js";
import { filterQuotaData } from "./quota-filter.js";
import { ClientTracker } from "./client-tracker.js";
import type { ShareConfig } from "./types.js";
import type { AccountCapacityInfo, AggregatedCapacity } from "../tui/types.js";
import { SHARE_CLIENT_TIMEOUT_MS } from "../constants.js";

export interface ShareRouterOptions {
  getConfig: () => ShareConfig;
  getQuotaData: () => {
    accounts: AccountCapacityInfo[];
    claudeCapacity: AggregatedCapacity;
    geminiCapacity: AggregatedCapacity;
  };
}

export function createShareRouter(options: ShareRouterOptions): Router {
  const router = Router();
  const { getConfig, getQuotaData } = options;

  // Initialize client tracker
  const tracker = new ClientTracker(getConfig().limits.maxClients, SHARE_CLIENT_TIMEOUT_MS);

  // Cleanup stale clients periodically
  setInterval(() => {
    tracker.cleanupStaleClients();
  }, 30000);

  // Auth middleware for all routes
  router.use(createShareAuthMiddleware(getConfig));

  /**
   * GET /share/status - Health check
   */
  router.get("/status", (_req: Request, res: Response) => {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      connectedClients: tracker.getConnectedClients().length,
      maxClients: getConfig().limits.maxClients,
    });
  });

  /**
   * POST /share/register - Register as a client
   */
  router.post("/register", (req: ShareAuthRequest, res: Response) => {
    const { nickname } = req.body as { nickname?: string };
    const keyMasked = req.shareAuth?.keyMasked ?? "anon";

    const result = tracker.registerClient(keyMasked, nickname ?? null);

    if (!result.success) {
      res.status(503).json({ error: result.error });
      return;
    }

    res.json({
      clientId: result.clientId,
      pollInterval: getConfig().limits.pollIntervalSeconds,
    });
  });

  /**
   * GET /share/quota - Get filtered quota data
   */
  router.get("/quota", (req: Request, res: Response) => {
    const config = getConfig();
    const { accounts, claudeCapacity, geminiCapacity } = getQuotaData();

    // Record poll if client ID provided
    const clientId = req.headers["x-client-id"] as string | undefined;
    if (clientId) {
      tracker.recordPoll(clientId);
    }

    const filtered = filterQuotaData(accounts, claudeCapacity, geminiCapacity, config.visibility);

    res.json(filtered);
  });

  /**
   * POST /share/disconnect - Disconnect client
   */
  router.post("/disconnect", (req: Request, res: Response) => {
    const clientId = req.headers["x-client-id"] as string | undefined;

    if (!clientId) {
      res.status(400).json({ error: "x-client-id header required" });
      return;
    }

    const session = tracker.disconnectClient(clientId);
    if (!session) {
      res.status(404).json({ error: "Client not found" });
      return;
    }

    res.json({ success: true });
  });

  /**
   * GET /share/clients - Get connected clients (host only)
   */
  router.get("/clients", (_req: Request, res: Response) => {
    res.json({
      clients: tracker.getConnectedClients(),
      maxClients: getConfig().limits.maxClients,
    });
  });

  return router;
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/share/router.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/share/router.ts tests/unit/share/router.test.ts
git commit -m "$(cat <<'EOF'
feat(share): add share router with quota and client endpoints

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Phase 3: Cloudflare Tunnel Integration

### Task 9: Cloudflare Tunnel Manager

**Files:**

- Create: `src/share/tunnel.ts`
- Test: `tests/unit/share/tunnel.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/unit/share/tunnel.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TunnelManager, checkCloudflaredInstalled } from "../../src/share/tunnel.js";
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
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/share/tunnel.test.ts`
Expected: FAIL with "Cannot find module"

**Step 3: Write minimal implementation**

```typescript
// src/share/tunnel.ts
/**
 * Cloudflare Tunnel Manager
 *
 * Manages cloudflared quick tunnel subprocess.
 */

import { spawn, type ChildProcess } from "child_process";
import { EventEmitter } from "events";

/**
 * Check if cloudflared is installed
 */
export async function checkCloudflaredInstalled(): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn("cloudflared", ["--version"]);

    proc.on("error", () => resolve(false));
    proc.on("close", (code) => resolve(code === 0));
  });
}

/**
 * Get installation instructions for cloudflared
 */
export function getInstallInstructions(): string {
  const platform = process.platform;

  switch (platform) {
    case "darwin":
      return "Install via Homebrew: brew install cloudflared";
    case "linux":
      return "Install via package manager or download from https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/";
    case "win32":
      return "Download from https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/";
    default:
      return "Visit https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/";
  }
}

export interface TunnelEvents {
  url: (url: string) => void;
  error: (error: Error) => void;
  close: (code: number | null) => void;
  reconnecting: () => void;
}

export class TunnelManager extends EventEmitter {
  private port: number;
  private process: ChildProcess | null = null;
  private url: string | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  constructor(port: number) {
    super();
    this.port = port;
  }

  /**
   * Start the tunnel
   */
  start(): void {
    if (this.process) {
      this.stop();
    }

    this.process = spawn("cloudflared", ["tunnel", "--url", `http://localhost:${this.port}`]);

    this.process.stdout?.on("data", (data: Buffer) => {
      this.parseOutput(data.toString());
    });

    this.process.stderr?.on("data", (data: Buffer) => {
      this.parseOutput(data.toString());
    });

    this.process.on("error", (error: Error) => {
      this.emit("error", error);
    });

    this.process.on("close", (code: number | null) => {
      this.emit("close", code);

      // Auto-reconnect on unexpected close
      if (code !== 0 && this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        this.emit("reconnecting");
        setTimeout(() => this.start(), 5000);
      }
    });
  }

  /**
   * Parse cloudflared output for tunnel URL
   */
  private parseOutput(output: string): void {
    // cloudflared outputs URL in format: INF | https://xxx.trycloudflare.com
    const urlMatch = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i.exec(output);
    if (urlMatch && !this.url) {
      this.url = urlMatch[0];
      this.reconnectAttempts = 0;
      this.emit("url", this.url);
    }
  }

  /**
   * Stop the tunnel
   */
  stop(): void {
    if (this.process) {
      this.process.kill();
      this.process = null;
      this.url = null;
    }
  }

  /**
   * Get current tunnel URL
   */
  getUrl(): string | null {
    return this.url;
  }

  /**
   * Check if tunnel is running
   */
  isRunning(): boolean {
    return this.process !== null && !this.process.killed;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/share/tunnel.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/share/tunnel.ts tests/unit/share/tunnel.test.ts
git commit -m "$(cat <<'EOF'
feat(share): add Cloudflare tunnel manager

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Phase 4: TUI Integration (Host Mode)

### Task 10: Share State Hook

**Files:**

- Create: `src/tui/hooks/useShareState.ts`
- Test: `tests/unit/tui/hooks/useShareState.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/unit/tui/hooks/useShareState.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useShareState } from "../../../src/tui/hooks/useShareState.js";

vi.mock("../../../src/share/tunnel.js", () => ({
  TunnelManager: vi.fn().mockImplementation(() => ({
    start: vi.fn(),
    stop: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    getUrl: vi.fn(() => null),
    isRunning: vi.fn(() => false),
  })),
  checkCloudflaredInstalled: vi.fn().mockResolvedValue(true),
}));

vi.mock("../../../src/share/config-storage.js", () => ({
  loadShareConfig: vi.fn().mockResolvedValue({
    auth: { enabled: true, mode: "single", masterKey: "test", friendKeys: [] },
    visibility: { showAccountEmails: false, showIndividualAccounts: true, showModelBreakdown: true, showBurnRate: false },
    limits: { maxClients: 5, pollIntervalSeconds: 10 },
    persistence: { resumeOnRestart: false },
  }),
  saveShareConfig: vi.fn().mockResolvedValue(undefined),
  getDefaultShareConfig: vi.fn().mockReturnValue({
    auth: { enabled: true, mode: "single", masterKey: null, friendKeys: [] },
    visibility: { showAccountEmails: false, showIndividualAccounts: true, showModelBreakdown: true, showBurnRate: false },
    limits: { maxClients: 5, pollIntervalSeconds: 10 },
    persistence: { resumeOnRestart: false },
  }),
}));

describe("useShareState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should initialize in normal mode", async () => {
    const { result } = renderHook(() => useShareState({ port: 8080 }));

    // Wait for initial load
    await vi.waitFor(() => {
      expect(result.current.mode).toBe("normal");
    });
  });

  it("should have startSharing function", async () => {
    const { result } = renderHook(() => useShareState({ port: 8080 }));

    await vi.waitFor(() => {
      expect(result.current.startSharing).toBeDefined();
    });
  });

  it("should have stopSharing function", async () => {
    const { result } = renderHook(() => useShareState({ port: 8080 }));

    await vi.waitFor(() => {
      expect(result.current.stopSharing).toBeDefined();
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/tui/hooks/useShareState.test.ts`
Expected: FAIL with "Cannot find module"

**Step 3: Write minimal implementation**

```typescript
// src/tui/hooks/useShareState.ts
/**
 * useShareState Hook
 *
 * Manages share mode state for the TUI.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { TunnelManager, checkCloudflaredInstalled } from "../../share/tunnel.js";
import { loadShareConfig, saveShareConfig, getDefaultShareConfig } from "../../share/config-storage.js";
import { SHARE_CONFIG_PATH } from "../../constants.js";
import type { ShareMode, ShareConfig, ShareHostState, ShareClientState, ConnectedClient } from "../../share/types.js";

export interface UseShareStateOptions {
  port: number;
}

export interface UseShareStateResult {
  mode: ShareMode;
  config: ShareConfig;
  hostState: ShareHostState;
  clientState: ShareClientState;
  cloudflaredInstalled: boolean | null;

  // Host actions
  startSharing: () => Promise<void>;
  stopSharing: () => void;
  copyUrl: () => void;

  // Client actions
  connectTo: (url: string, apiKey: string, nickname?: string) => Promise<void>;
  disconnect: () => void;

  // Config actions
  updateConfig: (partial: Partial<ShareConfig>) => Promise<void>;

  // Loading states
  loading: boolean;
  error: string | null;
}

export function useShareState(options: UseShareStateOptions): UseShareStateResult {
  const { port } = options;

  const [mode, setMode] = useState<ShareMode>("normal");
  const [config, setConfig] = useState<ShareConfig>(getDefaultShareConfig());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cloudflaredInstalled, setCloudflaredInstalled] = useState<boolean | null>(null);

  const [hostState, setHostState] = useState<ShareHostState>({
    active: false,
    tunnelUrl: null,
    connectedClients: [],
    error: null,
  });

  const [clientState, setClientState] = useState<ShareClientState>({
    connected: false,
    remoteUrl: null,
    hostNickname: null,
    error: null,
    reconnecting: false,
    lastPollAt: null,
  });

  const tunnelRef = useRef<TunnelManager | null>(null);

  // Load config on mount
  useEffect(() => {
    const init = async () => {
      try {
        const [cfg, installed] = await Promise.all([loadShareConfig(SHARE_CONFIG_PATH), checkCloudflaredInstalled()]);
        setConfig(cfg);
        setCloudflaredInstalled(installed);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    };
    void init();
  }, []);

  // Start sharing (host mode)
  const startSharing = useCallback(async () => {
    if (!cloudflaredInstalled) {
      setError("cloudflared is not installed");
      return;
    }

    setMode("host");
    setHostState((prev) => ({ ...prev, active: true, error: null }));

    const tunnel = new TunnelManager(port);
    tunnelRef.current = tunnel;

    tunnel.on("url", (url: string) => {
      setHostState((prev) => ({ ...prev, tunnelUrl: url }));
    });

    tunnel.on("error", (err: Error) => {
      setHostState((prev) => ({ ...prev, error: err.message }));
    });

    tunnel.on("reconnecting", () => {
      setHostState((prev) => ({ ...prev, error: "Reconnecting..." }));
    });

    tunnel.start();
  }, [port, cloudflaredInstalled]);

  // Stop sharing
  const stopSharing = useCallback(() => {
    tunnelRef.current?.stop();
    tunnelRef.current = null;
    setMode("normal");
    setHostState({
      active: false,
      tunnelUrl: null,
      connectedClients: [],
      error: null,
    });
  }, []);

  // Copy URL to clipboard
  const copyUrl = useCallback(() => {
    if (hostState.tunnelUrl) {
      // In Node.js environment, we'll emit an event for the TUI to handle
      // The actual clipboard copy happens in the component
    }
  }, [hostState.tunnelUrl]);

  // Connect to remote (client mode)
  const connectTo = useCallback(async (url: string, apiKey: string, nickname?: string) => {
    setMode("client");
    setClientState((prev) => ({
      ...prev,
      connected: true,
      remoteUrl: url,
      error: null,
    }));

    // TODO: Implement actual connection logic in Task 12
  }, []);

  // Disconnect from remote
  const disconnect = useCallback(() => {
    setMode("normal");
    setClientState({
      connected: false,
      remoteUrl: null,
      hostNickname: null,
      error: null,
      reconnecting: false,
      lastPollAt: null,
    });
  }, []);

  // Update config
  const updateConfig = useCallback(
    async (partial: Partial<ShareConfig>) => {
      const newConfig = {
        ...config,
        ...partial,
        auth: { ...config.auth, ...(partial.auth ?? {}) },
        visibility: { ...config.visibility, ...(partial.visibility ?? {}) },
        limits: { ...config.limits, ...(partial.limits ?? {}) },
        persistence: { ...config.persistence, ...(partial.persistence ?? {}) },
      };

      await saveShareConfig(SHARE_CONFIG_PATH, newConfig);
      setConfig(newConfig);
    },
    [config],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      tunnelRef.current?.stop();
    };
  }, []);

  return {
    mode,
    config,
    hostState,
    clientState,
    cloudflaredInstalled,
    startSharing,
    stopSharing,
    copyUrl,
    connectTo,
    disconnect,
    updateConfig,
    loading,
    error,
  };
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/tui/hooks/useShareState.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/tui/hooks/useShareState.ts tests/unit/tui/hooks/useShareState.test.ts
git commit -m "$(cat <<'EOF'
feat(share): add useShareState hook for TUI

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: Share Status Bar Component

**Files:**

- Create: `src/tui/components/ShareStatusBar.tsx`
- Test: `tests/unit/tui/components/ShareStatusBar.test.tsx`

This task creates the header/footer status indicator showing share mode status.

**Step 1: Write the failing test**

```typescript
// tests/unit/tui/components/ShareStatusBar.test.tsx
import React from "react";
import { describe, it, expect } from "vitest";
import { render } from "ink-testing-library";
import { ShareStatusBar } from "../../../src/tui/components/ShareStatusBar.js";

describe("ShareStatusBar", () => {
  it("should show nothing in normal mode", () => {
    const { lastFrame } = render(
      <ShareStatusBar mode="normal" tunnelUrl={null} clientCount={0} />
    );

    expect(lastFrame()).toBe("");
  });

  it("should show sharing indicator in host mode", () => {
    const { lastFrame } = render(
      <ShareStatusBar
        mode="host"
        tunnelUrl="https://test.trycloudflare.com"
        clientCount={2}
      />
    );

    expect(lastFrame()).toContain("SHARING");
    expect(lastFrame()).toContain("test.trycloudflare.com");
    expect(lastFrame()).toContain("2");
  });

  it("should show connected indicator in client mode", () => {
    const { lastFrame } = render(
      <ShareStatusBar
        mode="client"
        remoteUrl="https://host.trycloudflare.com"
        hostNickname="bob"
      />
    );

    expect(lastFrame()).toContain("CONNECTED");
    expect(lastFrame()).toContain("bob");
  });

  it("should show copy hint in host mode", () => {
    const { lastFrame } = render(
      <ShareStatusBar
        mode="host"
        tunnelUrl="https://test.trycloudflare.com"
        clientCount={0}
      />
    );

    expect(lastFrame()).toContain("[Y] Copy");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/tui/components/ShareStatusBar.test.tsx`
Expected: FAIL with "Cannot find module"

**Step 3: Write minimal implementation**

```typescript
// src/tui/components/ShareStatusBar.tsx
/**
 * Share Status Bar Component
 *
 * Displays share mode status in the TUI header/footer.
 */

import React from "react";
import { Box, Text } from "ink";
import type { ShareMode } from "../../share/types.js";

export interface ShareStatusBarProps {
  mode: ShareMode;
  tunnelUrl?: string | null;
  clientCount?: number;
  remoteUrl?: string | null;
  hostNickname?: string | null;
  reconnecting?: boolean;
}

export function ShareStatusBar({
  mode,
  tunnelUrl,
  clientCount = 0,
  remoteUrl,
  hostNickname,
  reconnecting = false,
}: ShareStatusBarProps): React.ReactElement | null {
  if (mode === "normal") {
    return null;
  }

  if (mode === "host") {
    const shortUrl = tunnelUrl?.replace("https://", "") ?? "Starting...";

    return (
      <Box>
        <Text bold color="green">
          {" SHARING "}
        </Text>
        <Text dimColor> │ </Text>
        <Text color="cyan">{shortUrl}</Text>
        <Text dimColor> │ </Text>
        <Text>
          {clientCount} client{clientCount !== 1 ? "s" : ""}
        </Text>
        <Text dimColor> │ </Text>
        <Text dimColor>[Y] Copy</Text>
      </Box>
    );
  }

  if (mode === "client") {
    const displayName = hostNickname ?? remoteUrl?.replace("https://", "") ?? "remote";

    return (
      <Box>
        <Text bold color="blue">
          {reconnecting ? " RECONNECTING " : " CONNECTED "}
        </Text>
        <Text dimColor> │ </Text>
        <Text>viewing {displayName}'s quotas</Text>
        {reconnecting && (
          <>
            <Text dimColor> │ </Text>
            <Text color="yellow">●</Text>
          </>
        )}
        {!reconnecting && (
          <>
            <Text dimColor> │ </Text>
            <Text color="green">● Live</Text>
          </>
        )}
      </Box>
    );
  }

  return null;
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/tui/components/ShareStatusBar.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add src/tui/components/ShareStatusBar.tsx tests/unit/tui/components/ShareStatusBar.test.tsx
git commit -m "$(cat <<'EOF'
feat(share): add ShareStatusBar TUI component

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Remaining Tasks (Summary)

The following tasks complete the implementation:

### Task 12: Client Connection Hook

- Create `src/tui/hooks/useShareClient.ts`
- Implements polling logic with auto-reconnect
- Fetches remote quota data at configured interval

### Task 13: Connected Clients Panel Component

- Create `src/tui/components/ConnectedClientsPanel.tsx`
- Shows list of connected clients in host mode
- Displays nickname, connection time, poll count

### Task 14: Share Settings Modal

- Create `src/tui/components/ShareSettingsModal.tsx`
- UI for editing share config
- Toggle auth, manage friend keys, set visibility

### Task 15: Connect Modal

- Create `src/tui/components/ConnectModal.tsx`
- Input for URL, API key, nickname
- Validation and error display

### Task 16: Session History Panel

- Create `src/tui/components/SessionHistoryPanel.tsx`
- Shows past client sessions from log

### Task 17: Integrate Share Mode into App

- Modify `src/tui/app.tsx`
- Add keybinds: S (share), C (connect), D (disconnect), Y (copy)
- Integrate ShareStatusBar into header
- Handle mode switching

### Task 18: CLI Flags

- Modify `src/cli/index.ts`
- Add `--share`, `--connect <url>`, `--api-key <key>`, `--no-auth` flags
- Pass flags to TUI startup

### Task 19: Mount Share Router in Server

- Modify `src/server.ts`
- Conditionally mount `/share/*` routes when share mode active
- Pass quota data provider to router

### Task 20: Session Logging

- Create `src/share/session-logger.ts`
- Append session entries to log file
- Rotation/cleanup logic

### Task 21: Export Share Module Index

- Create `src/share/index.ts`
- Re-export all share module components

### Task 22: Integration Tests

- Create `tests/integration/share-mode.test.ts`
- End-to-end tests for share flow

---

## Execution Notes

**Dependencies between tasks:**

- Tasks 1-4 (types, storage, api-key, constants) are independent
- Task 5-8 (middleware, filter, tracker, router) depend on 1-4
- Task 9 (tunnel) is independent
- Tasks 10-16 (TUI) depend on 1-9
- Tasks 17-19 (integration) depend on all above

**Parallel execution opportunities:**

- Tasks 1-4 can run in parallel
- Tasks 5-8 can run in parallel after 1-4
- Task 9 can run in parallel with 5-8
- Tasks 11-16 can run in parallel after 10

---

**Plan complete and saved to `docs/plans/2026-01-12-share-mode.md`. Two execution options:**

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach?**
