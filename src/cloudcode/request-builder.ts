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

  const payload: CloudCodeRequest = {
    project: projectId,
    model: model,
    request: googleRequest,
    userAgent: "antigravity",
    requestId: "agent-" + crypto.randomUUID(),
  };

  return payload;
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
