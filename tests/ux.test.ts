import { describe, expect, test } from "vitest";
import {
  DEFAULT_ACTIVE_CACHE_TTL_MS,
  DEFAULT_ELIGIBLE_CACHE_TTL_MS,
  formatCacheAge,
  isCacheEntryFresh
} from "../src/lib/cache";
import {
  ENTRA_PORTAL_URLS,
  getActivationRequirements,
  getPortalUrlForTab,
  tokenStatusText
} from "../src/lib/popupModel";
import type { ActivationItem } from "../src/lib/types";

const directoryRole: ActivationItem = {
  id: "directoryRole:reader:/",
  type: "directoryRole",
  sourceName: "Global Reader",
  displayName: "Global Reader",
  principalId: "user-1",
  roleDefinitionId: "reader",
  directoryScopeId: "/",
  scopeLabel: "Tenant",
  status: "eligible"
};

const azureRole: ActivationItem = {
  id: "azureRole:contributor:/subscriptions/sub-1",
  type: "azureRole",
  sourceName: "Contributor",
  displayName: "Contributor",
  principalId: "user-1",
  roleDefinitionId: "contributor",
  scope: "/subscriptions/sub-1",
  scopeLabel: "Production",
  status: "eligible"
};

describe("popup cache helpers", () => {
  test("uses separate freshness windows for eligible and active data", () => {
    const now = Date.parse("2026-05-18T12:00:00.000Z");

    expect(
      isCacheEntryFresh({ items: [directoryRole], errors: [], fetchedAt: now - DEFAULT_ELIGIBLE_CACHE_TTL_MS + 1 }, DEFAULT_ELIGIBLE_CACHE_TTL_MS, now)
    ).toBe(true);
    expect(
      isCacheEntryFresh({ items: [directoryRole], errors: [], fetchedAt: now - DEFAULT_ELIGIBLE_CACHE_TTL_MS - 1 }, DEFAULT_ELIGIBLE_CACHE_TTL_MS, now)
    ).toBe(false);
    expect(
      isCacheEntryFresh({ items: [], errors: [], fetchedAt: now - DEFAULT_ACTIVE_CACHE_TTL_MS - 1 }, DEFAULT_ACTIVE_CACHE_TTL_MS, now)
    ).toBe(false);
  });

  test("formats cache age in minutes for status copy", () => {
    const now = Date.parse("2026-05-18T12:10:00.000Z");
    expect(formatCacheAge(Date.parse("2026-05-18T12:09:20.000Z"), now)).toBe("less than 1 min ago");
    expect(formatCacheAge(Date.parse("2026-05-18T12:02:00.000Z"), now)).toBe("8 min ago");
  });
});

describe("popup model helpers", () => {
  test("shows readable token status instead of raw minute badges", () => {
    expect(tokenStatusText("Microsoft Graph", { hasToken: true, tokenAge: 1, isExpired: false })).toBe(
      "Microsoft Graph token active, captured 1 min ago"
    );
    expect(tokenStatusText("Azure Management", { hasToken: false })).toBe("Azure Management token missing");
  });

  test("maps role tabs to matching Entra portal pages", () => {
    expect(getPortalUrlForTab("directoryRole")).toBe(ENTRA_PORTAL_URLS.directoryRole);
    expect(getPortalUrlForTab("pimGroup")).toBe(ENTRA_PORTAL_URLS.pimGroup);
    expect(getPortalUrlForTab("azureRole")).toBe(ENTRA_PORTAL_URLS.azureRole);
    expect(getPortalUrlForTab("active")).toBeUndefined();
  });

  test("only requests activation metadata fields required by selected items", () => {
    expect(getActivationRequirements([])).toEqual({
      needsJustification: false,
      needsTicket: false
    });
    expect(getActivationRequirements([directoryRole, azureRole])).toEqual({
      needsJustification: true,
      needsTicket: false
    });
    expect(getActivationRequirements([{ ...directoryRole, activationRequirements: { justification: true, ticket: true } }])).toEqual({
      needsJustification: true,
      needsTicket: true
    });
  });
});
