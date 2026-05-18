import { describe, expect, test } from "vitest";
import {
  buildAccessCapabilityItems,
  getAccessSetupTargets,
  getPortalUrlsForTargets
} from "../src/lib/access";
import { ENTRA_PORTAL_URLS } from "../src/lib/popupModel";
import type { QuickPimDataCache, TokenStatus } from "../src/lib/types";

const missingTokens: TokenStatus = {
  graph: { hasToken: false },
  azureManagement: { hasToken: false }
};

const freshTokensWithoutVisibleScopes: TokenStatus = {
  graph: {
    hasToken: true,
    isExpired: false,
    tokenAge: 1,
    grantedScopes: []
  },
  azureManagement: {
    hasToken: true,
    isExpired: false,
    tokenAge: 1
  }
};

describe("portal-driven access setup", () => {
  test("selects only portal targets that need setup", () => {
    const items = buildAccessCapabilityItems(missingTokens, {});

    expect(getAccessSetupTargets(items)).toEqual(["directoryRole", "pimGroup", "azureRole"]);
    expect(getPortalUrlsForTargets(["directoryRole", "azureRole"])).toEqual([
      ENTRA_PORTAL_URLS.directoryRole,
      ENTRA_PORTAL_URLS.azureRole
    ]);
  });

  test("uses successful API diagnostics over missing token scope claims", () => {
    const cache: QuickPimDataCache = {
      eligible: {
        items: [],
        errors: [],
        fetchedAt: Date.parse("2026-05-18T12:00:00.000Z"),
        diagnostics: [
          {
            target: "pimGroup",
            success: true,
            checkedAt: "2026-05-18T12:00:00.000Z"
          }
        ]
      }
    };

    const status = buildAccessCapabilityItems(freshTokensWithoutVisibleScopes, cache);

    expect(status.find((item) => item.target === "pimGroup")).toMatchObject({
      status: "ready",
      detail: "Last API check succeeded."
    });
  });

  test("isolates feature failures instead of marking every feature limited", () => {
    const cache: QuickPimDataCache = {
      eligible: {
        items: [],
        errors: [],
        fetchedAt: Date.parse("2026-05-18T12:00:00.000Z"),
        diagnostics: [
          {
            target: "directoryRole",
            success: true,
            checkedAt: "2026-05-18T12:00:00.000Z"
          },
          {
            target: "pimGroup",
            success: false,
            checkedAt: "2026-05-18T12:01:00.000Z",
            error: "Authorization failed due to missing permission scope PrivilegedAssignmentSchedule.Read.AzureADGroup"
          }
        ]
      }
    };

    const status = buildAccessCapabilityItems(freshTokensWithoutVisibleScopes, cache);

    expect(status.find((item) => item.target === "directoryRole")).toMatchObject({ status: "ready" });
    expect(status.find((item) => item.target === "pimGroup")).toMatchObject({ status: "limited" });
    expect(status.find((item) => item.target === "azureRole")).toMatchObject({ status: "ready" });
  });
});
