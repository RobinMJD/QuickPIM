import { describe, expect, test, vi } from "vitest";
import { DEFAULT_SETTINGS, SETTINGS_KEY } from "../src/lib/settings";

describe("settings About page", () => {
  test("renders v2 version, original author credit, and local privacy note", async () => {
    document.body.innerHTML = '<div id="root"></div>';
    window.history.replaceState(null, "", "#about");

    const storageData: Record<string, unknown> = {
      [SETTINGS_KEY]: DEFAULT_SETTINGS
    };
    const chromeMock = {
      runtime: {
        getManifest: () => ({ name: "QuickPIM", version: "2.0.0" }),
        sendMessage: vi.fn(async (message: { action: string }) => {
          if (message.action === "getActivationItems") {
            return { success: true, data: { items: [], errors: [] } };
          }
          if (message.action === "getTokenStatus") {
            return {
              success: true,
              data: {
                graph: { hasToken: false },
                azureManagement: { hasToken: false }
              }
            };
          }
          return { success: true, data: true };
        })
      },
      storage: {
        local: {
          get: vi.fn(async (key: string) => ({ [key]: storageData[key] })),
          set: vi.fn(async (value: Record<string, unknown>) => Object.assign(storageData, value)),
          remove: vi.fn(async () => undefined)
        }
      }
    };

    vi.stubGlobal("chrome", chromeMock);
    vi.resetModules();
    await import("../src/settings/main");
    await new Promise((resolve) => setTimeout(resolve, 80));

    const text = document.body.textContent || "";
    expect(text).toContain("QuickPIM 2.0.0");
    expect(text).toContain("Original author: Daniel Bradley");
    expect(text).toContain("Tokens and settings stay in this browser profile.");
  });
});
