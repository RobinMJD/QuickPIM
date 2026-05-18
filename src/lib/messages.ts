import type { ActivationItem, TicketInfo, TokenKind } from "./types";

export type QuickPimMessage =
  | { action: "getTokenStatus" }
  | { action: "clearToken" }
  | { action: "getActivationItems" }
  | { action: "getActiveItems" }
  | {
      action: "activateItems";
      items: ActivationItem[];
      durationHours: number;
      justification: string;
      ticketInfo?: TicketInfo;
    };

const SIMPLE_ACTIONS = new Set(["getTokenStatus", "clearToken", "getActivationItems", "getActiveItems"]);

export function validateQuickPimMessage(message: unknown): QuickPimMessage {
  if (!isRecord(message) || typeof message.action !== "string") {
    throw new Error("Unsupported QuickPIM message.");
  }

  if (SIMPLE_ACTIONS.has(message.action)) {
    return { action: message.action } as QuickPimMessage;
  }

  if (message.action !== "activateItems") {
    throw new Error("Unsupported QuickPIM message.");
  }

  if (!Array.isArray(message.items)) {
    throw new Error("Activation items must be an array.");
  }

  if (!Number.isFinite(message.durationHours)) {
    throw new Error("Activation duration is required.");
  }

  if (typeof message.justification !== "string") {
    throw new Error("Activation justification is required.");
  }

  if (message.ticketInfo !== undefined && !isRecord(message.ticketInfo)) {
    throw new Error("Ticket information must be an object.");
  }

  return {
    action: "activateItems",
    items: message.items as ActivationItem[],
    durationHours: Number(message.durationHours),
    justification: message.justification,
    ticketInfo: message.ticketInfo as TicketInfo | undefined
  };
}

export function isTrustedRuntimeSender(sender: chrome.runtime.MessageSender): boolean {
  return sender.id === chrome.runtime.id;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
