/**
 * Port validation utility
 */

/**
 * Validate a port string input
 * @param input - The port string to validate
 * @returns Error message or null if valid
 */
export function validatePort(input: string): string | null {
  if (!input.trim()) {
    return "Port required";
  }

  // Check for valid integer
  if (!/^\d+$/.test(input)) {
    return "Must be a number";
  }

  const port = parseInt(input, 10);

  if (port < 1 || port > 65535) {
    return "Port must be 1-65535";
  }

  return null;
}
