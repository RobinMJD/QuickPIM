import type { ActivationItem, TokenStatusEntry } from "./types";

export type RoleTab = "directoryRole" | "pimGroup" | "azureRole";
export type PopupTab = RoleTab | "active" | "bundles";

export const ENTRA_PORTAL_URLS: Record<RoleTab, string> = {
  directoryRole:
    "https://entra.microsoft.com/?feature.msaljs=true#view/Microsoft_Azure_PIMCommon/ActivationMenuBlade/~/aadmigratedroles/provider/azurerbac",
  pimGroup:
    "https://entra.microsoft.com/?feature.msaljs=true#view/Microsoft_Azure_PIMCommon/ActivationMenuBlade/~/aadgroup/provider/azurerbac",
  azureRole:
    "https://entra.microsoft.com/?feature.msaljs=true#view/Microsoft_Azure_PIMCommon/ActivationMenuBlade/~/azurerbac/provider/azurerbac"
};

export function getPortalUrlForTab(tab: PopupTab): string | undefined {
  if (tab === "directoryRole" || tab === "pimGroup" || tab === "azureRole") {
    return ENTRA_PORTAL_URLS[tab];
  }
  return undefined;
}

export function tokenStatusText(label: string, status: TokenStatusEntry | undefined): string {
  if (!status?.hasToken) {
    return `${label} token missing`;
  }

  if (status.isExpired) {
    return `${label} token expired, refresh from the portal`;
  }

  const age = status.tokenAge ?? 0;
  return `${label} token active, captured ${age} min ago`;
}

export function tokenStatusTone(status: TokenStatusEntry | undefined): "ok" | "warn" {
  return status?.hasToken && !status.isExpired ? "ok" : "warn";
}

export function getActivationRequirements(items: ActivationItem[]) {
  return {
    needsJustification: items.some((item) => item.activationRequirements?.justification !== false),
    needsTicket: items.some((item) => item.activationRequirements?.ticket === true)
  };
}

export function tabLabel(tab: PopupTab): string {
  const labels: Record<PopupTab, string> = {
    directoryRole: "Entra Roles",
    pimGroup: "PIM Groups",
    azureRole: "Azure Roles",
    active: "Active",
    bundles: "Bundles"
  };
  return labels[tab];
}
