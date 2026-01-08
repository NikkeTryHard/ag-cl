/**
 * Request Builder for Cloud Code
 *
 * Builds request payloads and headers for the Cloud Code API.
 */

import * as crypto from "crypto";
import { ANTIGRAVITY_HEADERS, getModelFamily, isThinkingModel } from "../constants.js";
import { convertAnthropicToGoogle } from "../format/index.js";
import { deriveSessionId } from "./session-manager.js";
import { getIdentityMode } from "../settings/defaults.js";
import type { AnthropicRequest, GoogleRequest } from "../format/types.js";

/**
 * Extended Google request with session ID for Cloud Code
 */
interface CloudCodeGoogleRequest extends GoogleRequest {
  sessionId?: string;
}

/**
 * Cloud Code API request payload
 */
export interface CloudCodeRequest {
  project: string;
  model: string;
  request: CloudCodeGoogleRequest;
  userAgent: string;
  requestId: string;
  requestType: string;
}

/**
 * Headers object type
 */
export interface RequestHeaders {
  Authorization: string;
  "Content-Type": string;
  "User-Agent"?: string;
  "X-Goog-Api-Client"?: string;
  "Client-Metadata"?: string;
  "anthropic-beta"?: string;
  Accept?: string;
  [key: string]: string | undefined;
}

/**
 * Build the wrapped request body for Cloud Code API
 *
 * @param anthropicRequest - The Anthropic-format request
 * @param projectId - The project ID to use
 * @returns The Cloud Code API request payload
 */
export function buildCloudCodeRequest(anthropicRequest: AnthropicRequest, projectId: string): CloudCodeRequest {
  const model = anthropicRequest.model;
  const googleRequest = convertAnthropicToGoogle(anthropicRequest) as CloudCodeGoogleRequest;

  // Use stable session ID derived from first user message for cache continuity
  googleRequest.sessionId = deriveSessionId(anthropicRequest);

  // Inject Antigravity identity into system instruction to mimic genuine requests
  // This helps avoid 429 errors by making requests appear more legitimate
  injectAntigravitySystemInstruction(googleRequest, model);

  const payload: CloudCodeRequest = {
    project: projectId,
    model: model,
    request: googleRequest,
    userAgent: "antigravity",
    requestId: "agent-" + crypto.randomUUID(),
    requestType: "agent",
  };

  return payload;
}

/**
 * Antigravity identity text to inject into system instructions
 * This helps avoid 429 errors by making requests appear more like genuine Antigravity IDE requests.
 *
 * Can be configured via AG_INJECT_IDENTITY environment variable:
 * - "full" (default): Full identity with ~300 tokens
 * - "short": Shortened identity matching CLIProxyAPI v6.6.89 (~50 tokens)
 * - "none": Disable injection (may cause 429 errors)
 */
const ANTIGRAVITY_IDENTITY_FULL = `<identity>
You are Antigravity, a powerful agentic AI coding assistant designed by the Google Deepmind team working on Advanced Agentic Coding.
You are pair programming with a USER to solve their coding task. The task may require creating a new codebase, modifying or debugging an existing codebase, or simply answering a question.
The USER will send you requests, which you must always prioritize addressing. Along with each USER request, we will attach additional metadata about their current state, such as what files they have open and where their cursor is.
This information may or may not be relevant to the coding task, it is up for you to decide.
</identity>

<tool_calling>
Call tools as you normally would. The following list provides additional guidance to help you avoid errors:
  - **Absolute paths only**. When using tools that accept file path arguments, ALWAYS use the absolute file path.
</tool_calling>

<communication_style>
- **Formatting**. Format your responses in github-style markdown to make your responses easier for the USER to parse. For example, use headers to organize your responses and bolded or italicized text to highlight important keywords. Use backticks to format file, directory, function, and class names.
- **Proactiveness**. As an agent, you are allowed to be proactive, but only in the course of completing the user's task.
- **Helpfulness**. Respond like a helpful software engineer who is explaining your work to a friendly collaborator on the project.
- **Ask for clarification**. If you are unsure about the USER's intent, always ask for clarification rather than making assumptions.
</communication_style>`;

/**
 * Shortened identity matching CLIProxyAPI v6.6.89
 * Uses fewer tokens while maintaining core identity
 */
const ANTIGRAVITY_IDENTITY_SHORT = `You are Antigravity, a powerful agentic AI coding assistant designed by the Google Deepmind team working on Advanced Agentic Coding.You are pair programming with a USER to solve their coding task. The task may require creating a new codebase, modifying or debugging an existing codebase, or simply answering a question.**Absolute paths only****Proactiveness**`;

/**
 * Check if model should have identity injection (claude or gemini-3-pro)
 * Matches CLIProxyAPI v6.6.89 behavior
 */
function shouldInjectIdentity(model: string): boolean {
  const modelLower = model.toLowerCase();
  return modelLower.includes("claude") || modelLower.includes("gemini-3-pro");
}

/**
 * Inject Antigravity identity into the system instruction
 * Sets role to "user" and prepends identity text to parts
 *
 * Matches CLIProxyAPI v6.6.89 behavior:
 * - Only injects for claude and gemini-3-pro models
 * - Preserves existing system instruction parts by appending after identity
 * - Can be configured via AG_INJECT_IDENTITY env var (full/short/none)
 *
 * @param googleRequest - The Google request to modify
 * @param model - The model name to check for injection eligibility
 */
function injectAntigravitySystemInstruction(googleRequest: CloudCodeGoogleRequest, model: string): void {
  const mode = getIdentityMode();

  // If disabled, only set role on existing instructions
  if (mode === "none") {
    if (googleRequest.systemInstruction) {
      googleRequest.systemInstruction.role = "user";
    }
    return;
  }

  // Only inject identity for claude and gemini-3-pro models (CLIProxyAPI v6.6.89 behavior)
  if (!shouldInjectIdentity(model)) {
    if (googleRequest.systemInstruction) {
      googleRequest.systemInstruction.role = "user";
    }
    return;
  }

  // Select identity text based on mode
  const identityText = mode === "short" ? ANTIGRAVITY_IDENTITY_SHORT : ANTIGRAVITY_IDENTITY_FULL;
  const identityPart = { text: identityText };

  // Save existing parts before modification (CLIProxyAPI v6.6.89 pattern)
  const existingParts = googleRequest.systemInstruction?.parts ?? [];

  // Create new system instruction with identity first, then existing parts
  googleRequest.systemInstruction = {
    role: "user",
    parts: [identityPart, ...existingParts],
  };
}

/**
 * Build headers for Cloud Code API requests
 *
 * @param token - OAuth access token
 * @param model - Model name
 * @param accept - Accept header value (default: 'application/json')
 * @returns Headers object
 */
export function buildHeaders(token: string, model: string, accept = "application/json"): RequestHeaders {
  const headers: RequestHeaders = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    ...ANTIGRAVITY_HEADERS,
  };

  const modelFamily = getModelFamily(model);

  // Add interleaved thinking header only for Claude thinking models
  if (modelFamily === "claude" && isThinkingModel(model)) {
    headers["anthropic-beta"] = "interleaved-thinking-2025-05-14";
  }

  if (accept !== "application/json") {
    headers.Accept = accept;
  }

  return headers;
}
