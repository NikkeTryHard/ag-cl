/**
 * Cloudflare Tunnel Manager
 *
 * Manages cloudflared quick tunnel subprocess.
 */

import { spawn, type ChildProcess } from "child_process";
import { EventEmitter } from "events";

const DEFAULT_BASE_RECONNECT_DELAY_MS = 1000;
const DEFAULT_MAX_RECONNECT_DELAY_MS = 30000;
const DEFAULT_MAX_RECONNECT_ATTEMPTS = 5;

export interface TunnelManagerOptions {
  port: number;
  maxReconnectAttempts?: number;
  baseReconnectDelayMs?: number;
  maxReconnectDelayMs?: number;
}

/**
 * Check if cloudflared is installed
 */
export async function checkCloudflaredInstalled(): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn("cloudflared", ["--version"]);

    proc.on("error", () => {
      resolve(false);
    });
    proc.on("close", (code) => {
      resolve(code === 0);
    });
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
  private maxReconnectAttempts: number;
  private baseReconnectDelayMs: number;
  private maxReconnectDelayMs: number;

  constructor(options: TunnelManagerOptions | number) {
    super();
    if (typeof options === "number") {
      this.port = options;
      this.maxReconnectAttempts = DEFAULT_MAX_RECONNECT_ATTEMPTS;
      this.baseReconnectDelayMs = DEFAULT_BASE_RECONNECT_DELAY_MS;
      this.maxReconnectDelayMs = DEFAULT_MAX_RECONNECT_DELAY_MS;
    } else {
      this.port = options.port;
      this.maxReconnectAttempts = options.maxReconnectAttempts ?? DEFAULT_MAX_RECONNECT_ATTEMPTS;
      this.baseReconnectDelayMs = options.baseReconnectDelayMs ?? DEFAULT_BASE_RECONNECT_DELAY_MS;
      this.maxReconnectDelayMs = options.maxReconnectDelayMs ?? DEFAULT_MAX_RECONNECT_DELAY_MS;
    }
  }

  /**
   * Calculate backoff delay for reconnection attempts
   */
  private calculateBackoff(attempt: number): number {
    const delay = this.baseReconnectDelayMs * Math.pow(2, attempt);
    return Math.min(delay, this.maxReconnectDelayMs);
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
        const delay = this.calculateBackoff(this.reconnectAttempts);
        this.reconnectAttempts++;
        this.emit("reconnecting");
        setTimeout(() => {
          this.start();
        }, delay);
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
