/**
 * Test Models Configuration
 *
 * Provides model configuration for parameterized testing across
 * multiple model families (Claude and Gemini).
 *
 * TypeScript version of test-models.cjs
 */

export interface ModelConfig {
  family: string;
  model: string;
}

export interface ModelFamilyConfig {
  max_tokens: number;
  thinking: {
    type: "enabled";
    budget_tokens: number;
  };
}

// Default test models for each family
export const TEST_MODELS: Record<string, string> = {
  claude: "claude-sonnet-4-5-thinking",
  gemini: "gemini-3-flash",
};

// Default thinking model for each family
export const THINKING_MODELS: Record<string, string> = {
  claude: "claude-sonnet-4-5-thinking",
  gemini: "gemini-3-flash",
};

/**
 * Get models to test, optionally excluding certain families.
 * @param excludeFamilies - Array of family names to exclude (e.g., ['gemini'])
 * @returns Array of model configs to test
 */
export function getTestModels(excludeFamilies: string[] = []): ModelConfig[] {
  const models: ModelConfig[] = [];
  for (const [family, model] of Object.entries(TEST_MODELS)) {
    if (!excludeFamilies.includes(family)) {
      models.push({ family, model });
    }
  }
  return models;
}

/**
 * Get thinking models to test, optionally excluding certain families.
 * @param excludeFamilies - Array of family names to exclude
 * @returns Array of thinking model configs
 */
export function getThinkingModels(excludeFamilies: string[] = []): ModelConfig[] {
  const models: ModelConfig[] = [];
  for (const [family, model] of Object.entries(THINKING_MODELS)) {
    if (!excludeFamilies.includes(family)) {
      models.push({ family, model });
    }
  }
  return models;
}

/**
 * Check if a model family requires thinking features.
 * Both Claude thinking models and Gemini 3+ support thinking.
 * @param family - Model family name
 * @returns True if thinking is expected
 */
export function familySupportsThinking(family: string): boolean {
  // Both Claude thinking models and Gemini 3+ support thinking
  return family === "claude" || family === "gemini";
}

/**
 * Get model-specific configuration overrides.
 * @param family - Model family name
 * @returns Configuration overrides for the model family
 */
export function getModelConfig(family: string): ModelFamilyConfig {
  if (family === "gemini") {
    return {
      // Gemini has lower max output tokens
      max_tokens: 8000,
      thinking: { type: "enabled", budget_tokens: 10000 },
    };
  }
  return {
    max_tokens: 16000,
    thinking: { type: "enabled", budget_tokens: 10000 },
  };
}
