import { defineConfig } from "vitest/config";

export default defineConfig({
  // Benchmark configuration
  bench: {
    include: ["tests/bench/**/*.bench.ts"],
    exclude: ["node_modules", "dist"],
  },

  test: {
    // Use V8 for coverage
    coverage: {
      provider: "v8",
      enabled: true,
      reporter: ["text", "html", "lcov", "json"],
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.d.ts",
        "src/cli/**",
        "src/tui/**", // TUI components are tested via integration/manual testing
        "src/index.ts",
        "src/server.ts",
        "src/**/types.ts", // Type-only files
        "src/**/index.ts", // Re-export files
        "node_modules/**",
      ],
      // Coverage thresholds - enforce 90%+ coverage
      thresholds: {
        statements: 90,
        branches: 85,
        functions: 90,
        lines: 90,
      },
    },

    // Test configuration
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx", "tests/**/*.fuzz.test.ts", "tests/**/*.contract.test.ts", "tests/**/*.chaos.test.ts", "tests/**/*.golden.test.ts", "tests/**/*.snap.test.ts", "tests/**/*.security.test.ts", "tests/**/*.load.test.ts", "tests/**/*.type.test.ts", "tests/**/*.types.test.ts"],
    exclude: ["node_modules", "dist", "tests/**/*.cjs"],

    // Run oauth tests serially to avoid port conflicts
    sequence: {
      shuffle: false,
    },

    // Timeout for integration tests
    testTimeout: 60000,
    hookTimeout: 30000,

    // TypeScript support via tsx
    typecheck: {
      enabled: true,
    },

    // Global setup file
    setupFiles: ["./tests/setup.ts"],

    // Snapshot configuration
    snapshotFormat: {
      escapeString: false,
      printBasicPrototype: false,
    },

    // Isolate tests that modify global state (like fetch) to prevent interference
    isolate: true,

    // Use forks pool for better isolation of tests that bind to ports
    pool: "forks",
  },
});
