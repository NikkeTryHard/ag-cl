/**
 * Request Builder for Cloud Code
 *
 * Builds request payloads and headers for the Cloud Code API.
 */

import * as crypto from "crypto";
import { ANTIGRAVITY_HEADERS, getModelFamily, isThinkingModel } from "../constants.js";
import { convertAnthropicToGoogle } from "../format/index.js";
import { deriveSessionId } from "./session-manager.js";
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
  injectAntigravitySystemInstruction(googleRequest);

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
 * Adds ~300 tokens to each request.
 * 
 * Can be disabled by setting AG_INJECT_IDENTITY=none (may cause 429 errors)
 */
const ANTIGRAVITY_IDENTITY = `<identity>
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
 * Check if identity injection is disabled via environment variable
 */
function isIdentityInjectionDisabled(): boolean {
  return process.env.AG_INJECT_IDENTITY?.toLowerCase() === "none";
}

/**
 * Inject Antigravity identity into the system instruction
 * Sets role to "user" and prepends identity text to parts
 * 
 * Can be disabled by setting AG_INJECT_IDENTITY=none
 *
 * @param googleRequest - The Google request to modify
 */
function injectAntigravitySystemInstruction(googleRequest: CloudCodeGoogleRequest): void {
  // Check if disabled via env var
  if (isIdentityInjectionDisabled()) {
    // Only set role if systemInstruction exists
    if (googleRequest.systemInstruction) {
      googleRequest.systemInstruction.role = "user";
    }
    return;
  }

  const identityPart = { text: ANTIGRAVITY_IDENTITY };

  if (!googleRequest.systemInstruction) {
    // No existing system instruction, create one with identity
    googleRequest.systemInstruction = {
      role: "user",
      parts: [identityPart],
    };
  } else {
    // Prepend identity to existing parts and set role
    googleRequest.systemInstruction.role = "user";
    googleRequest.systemInstruction.parts = [identityPart, ...googleRequest.systemInstruction.parts];
  }
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
    ...(ANTIGRAVITY_HEADERS),
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
