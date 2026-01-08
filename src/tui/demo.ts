/**
 * Demo Mode Data Provider
 *
 * Provides fake data for recording demos without exposing real account info.
 * Enable with: AG_CL_DEMO=true ag-cl
 */

import type { AccountCapacityInfo, AggregatedCapacity } from "./types.js";
import { addLogEntry } from "./hooks/useLogBuffer.js";

/**
 * Check if demo mode is enabled
 */
export function isDemoMode(): boolean {
  return process.env.AG_CL_DEMO === "true" || process.env.AG_CL_DEMO === "1";
}

/**
 * Initialize demo logs with fake entries
 */
export function initDemoLogs(): void {
  const demoLogs = [
    { level: "info", message: "Server starting on port 8080..." },
    { level: "info", message: "Loaded 3 OAuth accounts" },
    { level: "info", message: "Prompt cache initialized (256 entries)" },
    { level: "debug", message: "Token refresh scheduled for alice@example.com" },
    { level: "info", message: "Server ready at http://localhost:8080" },
    { level: "info", message: "POST /v1/messages - claude-sonnet-4-5-thinking - 200 (1.2s)" },
    { level: "info", message: "POST /v1/messages - claude-sonnet-4-5-thinking - 200 (0.8s)" },
    { level: "warn", message: "Rate limit approaching for bob@example.com (15% remaining)" },
    { level: "info", message: "POST /v1/messages - gemini-3-flash - 200 (0.5s)" },
    { level: "debug", message: "Cache hit for prompt hash 7a3f2b1c" },
    { level: "info", message: "POST /v1/messages - claude-opus-4-5-thinking - 200 (2.1s)" },
    { level: "info", message: "Switched to carol@example.com (higher quota)" },
  ];

  // Add logs with slight time offsets
  demoLogs.forEach((log) => {
    addLogEntry(log.level, log.message);
  });
}

/**
 * Generate fake demo accounts
 */
export function getDemoAccounts(): AccountCapacityInfo[] {
  const claudeReset1 = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  const geminiReset1 = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();
  const claudeReset2 = new Date(Date.now() + 1.5 * 60 * 60 * 1000).toISOString();
  const claudeReset3 = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString();
  const geminiReset3 = new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString();

  return [
    {
      email: "alice@example.com",
      tier: "PRO",
      claudeModels: [
        { name: "claude-sonnet-4-5-thinking", percentage: 72, resetTime: claudeReset1 },
        { name: "claude-opus-4-5-thinking", percentage: 72, resetTime: claudeReset1 },
      ],
      geminiModels: [
        { name: "gemini-3-flash", percentage: 95, resetTime: geminiReset1 },
        { name: "gemini-3-pro-high", percentage: 88, resetTime: geminiReset1 },
      ],
      claudeReset: claudeReset1,
      geminiReset: geminiReset1,
      error: null,
    },
    {
      email: "bob@example.com",
      tier: "PRO",
      claudeModels: [
        { name: "claude-sonnet-4-5-thinking", percentage: 45, resetTime: claudeReset2 },
        { name: "claude-opus-4-5-thinking", percentage: 45, resetTime: claudeReset2 },
      ],
      geminiModels: [
        { name: "gemini-3-flash", percentage: 100, resetTime: null },
        { name: "gemini-3-pro-high", percentage: 100, resetTime: null },
      ],
      claudeReset: claudeReset2,
      geminiReset: null,
      error: null,
    },
    {
      email: "carol@example.com",
      tier: "ULTRA",
      claudeModels: [
        { name: "claude-sonnet-4-5-thinking", percentage: 89, resetTime: claudeReset3 },
        { name: "claude-opus-4-5-thinking", percentage: 89, resetTime: claudeReset3 },
      ],
      geminiModels: [
        { name: "gemini-3-flash", percentage: 76, resetTime: geminiReset3 },
        { name: "gemini-3-pro-high", percentage: 62, resetTime: geminiReset3 },
      ],
      claudeReset: claudeReset3,
      geminiReset: geminiReset3,
      error: null,
    },
  ];
}

/**
 * Get demo Claude capacity
 */
export function getDemoClaudeCapacity(): AggregatedCapacity {
  return {
    family: "claude",
    totalPercentage: 68,
    accountCount: 3,
    status: "burning",
    hoursToExhaustion: 4.5,
    ratePerHour: 12.5,
  };
}

/**
 * Get demo Gemini capacity
 */
export function getDemoGeminiCapacity(): AggregatedCapacity {
  return {
    family: "gemini",
    totalPercentage: 87,
    accountCount: 3,
    status: "stable",
    hoursToExhaustion: null,
    ratePerHour: 3.2,
  };
}
