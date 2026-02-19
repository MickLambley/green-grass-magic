/**
 * Debug logger for photo upload flow.
 * Captures detailed memory/timing info to diagnose mobile OOM crashes.
 * Logs are stored in-memory and can be downloaded as a text file.
 * Includes global error handlers to catch crashes before JS handlers run.
 */

interface LogEntry {
  timestamp: string;
  level: "info" | "warn" | "error";
  message: string;
  data?: Record<string, unknown>;
}

class PhotoDebugLogger {
  private logs: LogEntry[] = [];
  private maxLogs = 500;
  private globalHandlersInstalled = false;

  private getMemoryInfo(): Record<string, unknown> {
    const perf = (performance as any);
    if (perf.memory) {
      return {
        usedJSHeapSize: `${(perf.memory.usedJSHeapSize / 1024 / 1024).toFixed(1)}MB`,
        totalJSHeapSize: `${(perf.memory.totalJSHeapSize / 1024 / 1024).toFixed(1)}MB`,
        jsHeapSizeLimit: `${(perf.memory.jsHeapSizeLimit / 1024 / 1024).toFixed(1)}MB`,
      };
    }
    return { memory: "not available (non-Chrome)" };
  }

  private add(level: LogEntry["level"], message: string, data?: Record<string, unknown>) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      data: { ...data, ...this.getMemoryInfo() },
    };
    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) this.logs.shift();

    // Also log to console for live debugging
    const prefix = `[PhotoDebug ${entry.timestamp}]`;
    if (level === "error") console.error(prefix, message, data);
    else if (level === "warn") console.warn(prefix, message, data);
    else console.log(prefix, message, data);

    // Persist to sessionStorage so logs survive soft crashes
    try {
      sessionStorage.setItem("photoDebugLogs", JSON.stringify(this.logs));
    } catch {
      // Storage full or unavailable
    }
  }

  /** Install global error handlers to catch OOM and other crashes */
  installGlobalHandlers() {
    if (this.globalHandlersInstalled) return;
    this.globalHandlersInstalled = true;

    // Restore any logs from a previous crash
    try {
      const saved = sessionStorage.getItem("photoDebugLogs");
      if (saved) {
        const parsed = JSON.parse(saved) as LogEntry[];
        if (parsed.length > 0 && this.logs.length === 0) {
          this.logs = parsed;
          this.add("warn", "=== RESTORED LOGS FROM PREVIOUS SESSION (possible crash recovery) ===");
        }
      }
    } catch {
      // Ignore
    }

    window.addEventListener("error", (event) => {
      this.add("error", "GLOBAL window.onerror", {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        errorStr: event.error ? String(event.error) : undefined,
      });
    });

    window.addEventListener("unhandledrejection", (event) => {
      this.add("error", "GLOBAL unhandledrejection", {
        reason: event.reason ? String(event.reason) : "unknown",
      });
    });

    // Detect page visibility changes (can indicate browser killing the tab)
    document.addEventListener("visibilitychange", () => {
      this.add("info", `Page visibility: ${document.visibilityState}`);
    });

    // Detect page being unloaded (OOM kill, navigation, etc.)
    window.addEventListener("pagehide", (event) => {
      this.add("warn", "PAGE HIDE (possible OOM kill)", {
        persisted: event.persisted,
      });
    });

    window.addEventListener("beforeunload", () => {
      this.add("warn", "BEFORE UNLOAD fired");
    });

    // Detect when page regains focus (returning from camera)
    window.addEventListener("focus", () => {
      this.add("info", "Window FOCUS regained (returned from camera?)");
    });

    window.addEventListener("pageshow", (event) => {
      this.add("info", "PAGE SHOW", { persisted: event.persisted });
      if (event.persisted) {
        this.add("warn", "=== PAGE RESTORED FROM BF-CACHE ===");
      }
    });

    this.add("info", "Global error handlers installed");
  }

  info(message: string, data?: Record<string, unknown>) {
    this.add("info", message, data);
  }

  warn(message: string, data?: Record<string, unknown>) {
    this.add("warn", message, data);
  }

  error(message: string, data?: Record<string, unknown>) {
    this.add("error", message, data);
  }

  /** Get all logs as formatted text */
  getLogsText(): string {
    const header = [
      `Photo Debug Log — ${new Date().toISOString()}`,
      `User Agent: ${navigator.userAgent}`,
      `Screen: ${screen.width}x${screen.height} @ ${devicePixelRatio}x`,
      `Entries: ${this.logs.length}`,
      "─".repeat(60),
      "",
    ].join("\n");

    const body = this.logs
      .map((e) => {
        const dataStr = e.data ? "\n  " + JSON.stringify(e.data) : "";
        return `[${e.timestamp}] ${e.level.toUpperCase()} ${e.message}${dataStr}`;
      })
      .join("\n");

    return header + body;
  }

  /** Download logs as a .txt file */
  downloadLogs() {
    const text = this.getLogsText();
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `photo-debug-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  clear() {
    this.logs = [];
    try { sessionStorage.removeItem("photoDebugLogs"); } catch {}
  }
}

export const photoLogger = new PhotoDebugLogger();
