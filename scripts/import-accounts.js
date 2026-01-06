#!/usr/bin/env node

/**
 * Batch import accounts from JSON file using refresh tokens
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync } from "fs";
import { dirname } from "path";
import { ACCOUNT_CONFIG_PATH } from "../src/constants.js";
import { validateRefreshToken } from "../src/auth/oauth.js";

const inputFile = process.argv[2];

if (!inputFile) {
  console.error("Usage: node scripts/import-accounts.js <accounts.json>");
  console.error('File format: [{"email": "...", "refresh_token": "..."}]');
  process.exit(1);
}

// Load existing accounts
function loadAccounts() {
  try {
    if (existsSync(ACCOUNT_CONFIG_PATH)) {
      const data = readFileSync(ACCOUNT_CONFIG_PATH, "utf-8");
      const config = JSON.parse(data);
      return config.accounts || [];
    }
  } catch (error) {
    console.error("Error loading accounts:", error.message);
  }
  return [];
}

// Save accounts
function saveAccounts(accounts) {
  const dir = dirname(ACCOUNT_CONFIG_PATH);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const config = {
    accounts: accounts.map((acc) => ({
      email: acc.email,
      source: "oauth",
      refreshToken: acc.refreshToken,
      projectId: acc.projectId,
      addedAt: acc.addedAt || new Date().toISOString(),
      lastUsed: acc.lastUsed || null,
      modelRateLimits: acc.modelRateLimits || {},
    })),
    settings: {
      cooldownDurationMs: 60000,
      maxRetries: 5,
    },
    activeIndex: 0,
  };

  writeFileSync(ACCOUNT_CONFIG_PATH, JSON.stringify(config, null, 2));
}

async function main() {
  // Read input file
  const inputData = JSON.parse(readFileSync(inputFile, "utf-8"));
  console.log(`Found ${inputData.length} accounts to import\n`);

  const existingAccounts = loadAccounts();
  const existingEmails = new Set(existingAccounts.map((a) => a.email));

  let added = 0;
  let updated = 0;
  let failed = 0;

  for (const entry of inputData) {
    const email = entry.email;
    const refreshToken = entry.refresh_token;

    console.log(`Processing ${email}...`);

    try {
      const result = await validateRefreshToken(refreshToken);

      const existing = existingAccounts.find((a) => a.email === result.email);
      if (existing) {
        existing.refreshToken = result.refreshToken;
        existing.projectId = result.projectId;
        existing.addedAt = new Date().toISOString();
        console.log(`  Updated: ${result.email}`);
        updated++;
      } else {
        existingAccounts.push({
          email: result.email,
          refreshToken: result.refreshToken,
          projectId: result.projectId,
          addedAt: new Date().toISOString(),
          modelRateLimits: {},
        });
        console.log(`  Added: ${result.email} (project: ${result.projectId || "none"})`);
        added++;
      }
    } catch (error) {
      console.log(`  Failed: ${email} - ${error.message}`);
      failed++;
    }
  }

  // Save all accounts
  saveAccounts(existingAccounts);

  console.log(`\nDone!`);
  console.log(`  Added: ${added}`);
  console.log(`  Updated: ${updated}`);
  console.log(`  Failed: ${failed}`);
  console.log(`  Total: ${existingAccounts.length}`);
  console.log(`\nSaved to: ${ACCOUNT_CONFIG_PATH}`);
}

main().catch(console.error);
