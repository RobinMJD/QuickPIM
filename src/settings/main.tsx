import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "../styles.css";
import {
  DEFAULT_SETTINGS,
  SETTINGS_KEY,
  createBundleId,
  getDisplayName,
  getUsage,
  loadSettings,
  mergeSettings,
  saveSettings
} from "../lib/settings";
import {
  buildPermissionStatus,
  getMissingPermissionItems,
  permissionDocsUrl,
  permissionSetupPowerShell,
  permissionSetupTutorial,
  type PermissionStatusItem
} from "../lib/permissions";
import type { ActivationItem, QuickPimBundle, QuickPimSettings, SortMode, TokenStatus } from "../lib/types";

type SettingsTab = "about" | "permissions" | "aliases" | "justifications" | "bundles" | "preferences" | "data";

const ORIGINAL_AUTHOR = "Daniel Bradley";
const REPOSITORY_URL = "https://github.com/RobinMJD/QuickPIM";

interface MessageResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

function SettingsApp() {
  const [tab, setTab] = useState<SettingsTab>(() => tabFromHash());
  const [settings, setSettings] = useState<QuickPimSettings>(DEFAULT_SETTINGS);
  const [items, setItems] = useState<ActivationItem[]>([]);
  const [tokenStatus, setTokenStatus] = useState<TokenStatus | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [exportText, setExportText] = useState("");

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    function handleHashChange() {
      setTab(tabFromHash());
    }
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  async function refresh() {
    setError("");
    try {
      const [loadedSettings, loadedItems, loadedTokens] = await Promise.all([
        loadSettings(),
        sendMessage<{ items: ActivationItem[]; errors: string[] }>({ action: "getActivationItems" }),
        sendMessage<TokenStatus>({ action: "getTokenStatus" })
      ]);
      setSettings(loadedSettings);
      setItems(loadedItems.items);
      setTokenStatus(loadedTokens);
      setExportText(JSON.stringify(loadedSettings, null, 2));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    }
  }

  async function persist(next: QuickPimSettings, successMessage = "Settings saved.") {
    const merged = mergeSettings(next);
    await saveSettings(merged);
    setSettings(merged);
    setExportText(JSON.stringify(merged, null, 2));
    setMessage(successMessage);
  }

  async function clearCapturedTokens() {
    await sendMessage<boolean>({ action: "clearToken" });
    setTokenStatus({
      graph: { hasToken: false },
      azureManagement: { hasToken: false }
    });
    setMessage("Captured tokens cleared.");
  }

  function selectTab(nextTab: SettingsTab) {
    setTab(nextTab);
    if (window.location.hash !== `#${nextTab}`) {
      window.history.replaceState(null, "", `#${nextTab}`);
    }
  }

  return (
    <main className="settings-shell">
      <header className="settings-header">
        <div className="brand">
          <img src="/img/QuickPim48.png" alt="" />
          <div>
            <h1>QuickPIM Settings</h1>
            <p>Aliases, saved reasons, bundles, and local preferences.</p>
          </div>
        </div>
        <button className="btn" onClick={() => void refresh()}>
          Refresh eligible items
        </button>
      </header>

      <section className="settings-content">
        {error ? <p className="message error">{error}</p> : null}
        {message ? <p className="message">{message}</p> : null}
        <div className="settings-layout">
          <nav className="settings-nav">
            {(["about", "permissions", "aliases", "justifications", "bundles", "preferences", "data"] as SettingsTab[]).map((item) => (
              <button key={item} className={tab === item ? "active" : ""} onClick={() => selectTab(item)}>
                {tabLabel(item)}
              </button>
            ))}
          </nav>
          <div>
            {tab === "about" ? <AboutPanel tokenStatus={tokenStatus} onClearTokens={() => void clearCapturedTokens()} /> : null}
            {tab === "permissions" ? <PermissionsPanel settings={settings} tokenStatus={tokenStatus} onSave={persist} /> : null}
            {tab === "aliases" ? <AliasesPanel settings={settings} items={items} onSave={persist} /> : null}
            {tab === "justifications" ? <JustificationsPanel settings={settings} onSave={persist} /> : null}
            {tab === "bundles" ? <BundlesPanel settings={settings} items={items} onSave={persist} /> : null}
            {tab === "preferences" ? <PreferencesPanel settings={settings} onSave={persist} /> : null}
            {tab === "data" ? (
              <DataPanel
                settings={settings}
                exportText={exportText}
                setExportText={setExportText}
                onSave={persist}
                onClearMessage={() => setMessage("")}
              />
            ) : null}
          </div>
        </div>
      </section>
    </main>
  );
}

function AboutPanel({
  tokenStatus,
  onClearTokens
}: {
  tokenStatus: TokenStatus | null;
  onClearTokens: () => void;
}) {
  const manifest = chrome.runtime.getManifest();
  return (
    <section className="panel about-panel">
      <div>
        <h2>{manifest.name} {manifest.version}</h2>
        <p className="muted">Quick activation for Microsoft Entra roles, Azure roles, and PIM groups.</p>
      </div>
      <div className="about-grid">
        <div>
          <strong>Original author: {ORIGINAL_AUTHOR}</strong>
          <p className="muted">v2 continues the QuickPIM project with the React rewrite, PIM groups, bundles, and security hardening.</p>
        </div>
        <div>
          <strong>Privacy</strong>
          <p className="muted">Tokens and settings stay in this browser profile. QuickPIM only calls Microsoft Graph and Azure Management APIs.</p>
        </div>
        <div>
          <strong>Repository</strong>
          <p className="muted">
            <a href={REPOSITORY_URL} target="_blank" rel="noreferrer">
              {REPOSITORY_URL}
            </a>
          </p>
        </div>
        <div>
          <strong>Captured tokens</strong>
          <p className="muted">
            Graph: {tokenStatus?.graph.hasToken ? "captured" : "missing"} / Azure:{" "}
            {tokenStatus?.azureManagement.hasToken ? "captured" : "missing"}
          </p>
          <button className="btn danger" onClick={onClearTokens} style={{ marginTop: 8 }}>
            Clear captured tokens
          </button>
        </div>
      </div>
    </section>
  );
}

function PermissionsPanel({
  settings,
  tokenStatus,
  onSave
}: {
  settings: QuickPimSettings;
  tokenStatus: TokenStatus | null;
  onSave: (settings: QuickPimSettings, message?: string) => Promise<void>;
}) {
  const permissionStatus = useMemo(() => buildPermissionStatus(tokenStatus), [tokenStatus]);
  const missingPermissions = useMemo(() => getMissingPermissionItems(permissionStatus), [permissionStatus]);
  const warningIgnored = Boolean(settings.preferences.permissionWarningIgnored);

  async function setIgnored(ignored: boolean) {
    await onSave(
      {
        ...settings,
        preferences: {
          ...settings.preferences,
          permissionWarningIgnored: ignored,
          permissionWarningIgnoredAt: ignored ? new Date().toISOString() : undefined
        }
      },
      ignored ? "Permission warning ignored." : "Permission warning enabled."
    );
  }

  return (
    <section className="panel permissions-panel">
      <div className="panel-title-row">
        <div>
          <h2>Permissions</h2>
          <p className="muted">
            {missingPermissions.length
              ? `${missingPermissions.length} right(s) missing. Related QuickPIM features are limited until the token or account has them.`
              : "All required QuickPIM rights are visible in the currently captured tokens."}
          </p>
        </div>
        <button className={`btn ${warningIgnored ? "" : "subtle"}`} onClick={() => void setIgnored(!warningIgnored)}>
          {warningIgnored ? "Show popup warning" : "Ignore popup warning"}
        </button>
      </div>

      <div className="permission-list">
        {permissionStatus.map((item) => (
          <PermissionRow item={item} key={item.id} />
        ))}
      </div>

      <div className="panel">
        <h3>Quick Tutorial</h3>
        <ol className="tutorial-list">
          {permissionSetupTutorial.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <p className="muted">
          Microsoft Graph permission reference:{" "}
          <a href={permissionDocsUrl} target="_blank" rel="noreferrer">
            {permissionDocsUrl}
          </a>
        </p>
      </div>

      <div className="panel">
        <h3>Append Missing Graph Permissions</h3>
        <p className="muted">
          This example appends the Graph delegated scopes used by QuickPIM to a custom app registration. It keeps existing API
          permissions and still requires admin consent afterwards.
        </p>
        <pre className="code-box permission-code">{permissionSetupPowerShell}</pre>
      </div>
    </section>
  );
}

function PermissionRow({ item }: { item: PermissionStatusItem }) {
  return (
    <article className={`permission-row ${item.isPresent ? "ok" : "missing"}`}>
      <div className="permission-row-header">
        <span className={`permission-state ${item.isPresent ? "ok" : "missing"}`}>{item.isPresent ? "Present" : "Missing"}</span>
        <div>
          <h3>{item.name}</h3>
          <p>{item.category === "graph" ? "Microsoft Graph" : "Azure Management"}</p>
        </div>
      </div>
      <div className="permission-detail-grid">
        <div>
          <strong>Required</strong>
          <p>{item.requiredAnyOf.join(" or ")}</p>
        </div>
        <div>
          <strong>{item.isPresent ? "Detected" : "What will not work"}</strong>
          <p>{item.isPresent ? item.matchedBy : item.missingImpact}</p>
        </div>
      </div>
      {item.note ? <p className="permission-note">{item.note}</p> : null}
      {item.docsUrl ? (
        <a className="permission-doc-link" href={item.docsUrl} target="_blank" rel="noreferrer">
          Microsoft documentation
        </a>
      ) : null}
    </article>
  );
}

function AliasesPanel({
  settings,
  items,
  onSave
}: {
  settings: QuickPimSettings;
  items: ActivationItem[];
  onSave: (settings: QuickPimSettings, message?: string) => Promise<void>;
}) {
  const [itemId, setItemId] = useState("");
  const [alias, setAlias] = useState("");
  const selectedItem = items.find((item) => item.id === itemId);

  async function saveAlias() {
    if (!selectedItem || !alias.trim()) return;
    await onSave({
      ...settings,
      aliasesByItemId: {
        ...settings.aliasesByItemId,
        [selectedItem.id]: alias.trim()
      }
    });
    setAlias("");
  }

  async function removeAlias(id: string) {
    const aliasesByItemId = { ...settings.aliasesByItemId };
    delete aliasesByItemId[id];
    await onSave({ ...settings, aliasesByItemId });
  }

  return (
    <section className="panel">
      <h2>Custom Role Names</h2>
      <div className="form-grid">
        <div className="field">
          <label>Role or group</label>
          <select className="select" value={itemId} onChange={(event) => setItemId(event.target.value)}>
            <option value="">Choose an eligible item</option>
            {items.map((item) => (
              <option value={item.id} key={item.id}>
                {item.sourceName} / {item.scopeLabel}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Alias</label>
          <input className="input" value={alias} onChange={(event) => setAlias(event.target.value)} placeholder="Display name" />
        </div>
      </div>
      <div className="button-row" style={{ marginTop: 10 }}>
        <button className="btn primary" onClick={() => void saveAlias()} disabled={!itemId || !alias.trim()}>
          Save alias
        </button>
      </div>
      <div className="panel">
        <h3>Saved aliases</h3>
        {Object.entries(settings.aliasesByItemId).length ? (
          Object.entries(settings.aliasesByItemId).map(([id, value]) => (
            <div className="alias-row" key={id}>
              <div>
                <strong>{value}</strong>
                <p className="muted">{items.find((item) => item.id === id)?.sourceName || id}</p>
              </div>
              <button className="btn danger" onClick={() => void removeAlias(id)}>
                Remove
              </button>
            </div>
          ))
        ) : (
          <p className="muted">No aliases saved yet.</p>
        )}
      </div>
    </section>
  );
}

function JustificationsPanel({
  settings,
  onSave
}: {
  settings: QuickPimSettings;
  onSave: (settings: QuickPimSettings, message?: string) => Promise<void>;
}) {
  const [value, setValue] = useState("");

  async function add() {
    const trimmed = value.trim();
    if (!trimmed) return;
    const exists = settings.savedJustifications.some((item) => item.toLowerCase() === trimmed.toLowerCase());
    await onSave({
      ...settings,
      savedJustifications: exists ? settings.savedJustifications : [trimmed, ...settings.savedJustifications]
    });
    setValue("");
  }

  async function removeSaved(target: string) {
    await onSave({
      ...settings,
      savedJustifications: settings.savedJustifications.filter((item) => item !== target)
    });
  }

  return (
    <section className="panel">
      <h2>Justifications</h2>
      <div className="form-row">
        <input className="input" value={value} onChange={(event) => setValue(event.target.value)} placeholder="Reusable justification" />
        <button className="btn primary" onClick={() => void add()} disabled={!value.trim()}>
          Add
        </button>
      </div>
      <div className="two-column" style={{ marginTop: 12 }}>
        <div className="panel">
          <h3>Saved</h3>
          {settings.savedJustifications.map((item) => (
            <div className="settings-row" key={item}>
              <span>{item}</span>
              <button className="btn danger" onClick={() => void removeSaved(item)}>
                Remove
              </button>
            </div>
          ))}
          {!settings.savedJustifications.length ? <p className="muted">No saved justifications.</p> : null}
        </div>
        <div className="panel">
          <h3>Recent</h3>
          {settings.recentJustifications.map((item) => (
            <div className="settings-row" key={item}>
              <span>{item}</span>
            </div>
          ))}
          <button className="btn danger" onClick={() => void onSave({ ...settings, recentJustifications: [] }, "Recent history cleared.")}>
            Clear recent
          </button>
        </div>
      </div>
    </section>
  );
}

function BundlesPanel({
  settings,
  items,
  onSave
}: {
  settings: QuickPimSettings;
  items: ActivationItem[];
  onSave: (settings: QuickPimSettings, message?: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [durationHours, setDurationHours] = useState(settings.preferences.defaultDurationHours);
  const [justification, setJustification] = useState("");
  const [ticketSystem, setTicketSystem] = useState("");
  const [ticketNumber, setTicketNumber] = useState("");
  const sortedItems = useMemo(() => [...items].sort((a, b) => a.displayName.localeCompare(b.displayName)), [items]);

  async function saveBundle() {
    if (!name.trim() || !selectedItemIds.size) return;
    const bundle: QuickPimBundle = {
      id: createBundleId(name),
      name: name.trim(),
      itemIds: [...selectedItemIds],
      defaultDurationHours: durationHours,
      defaultJustification: justification.trim() || undefined,
      defaultTicketSystem: ticketSystem.trim() || undefined,
      defaultTicketNumber: ticketNumber.trim() || undefined
    };
    await onSave({ ...settings, bundles: [bundle, ...settings.bundles.filter((item) => item.id !== bundle.id)] });
    setName("");
    setSelectedItemIds(new Set());
    setJustification("");
    setTicketSystem("");
    setTicketNumber("");
  }

  async function removeBundle(bundleId: string) {
    await onSave({ ...settings, bundles: settings.bundles.filter((bundle) => bundle.id !== bundleId) });
  }

  function toggle(itemId: string) {
    setSelectedItemIds((current) => {
      const next = new Set(current);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  return (
    <section className="panel">
      <h2>Role Bundles</h2>
      <div className="form-grid three">
        <div className="field">
          <label>Name</label>
          <input className="input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Daily operations" />
        </div>
        <div className="field">
          <label>Duration</label>
          <input className="input" type="number" min="0.5" max="24" step="0.5" value={durationHours} onChange={(event) => setDurationHours(Number(event.target.value))} />
        </div>
        <div className="field">
          <label>Justification</label>
          <input className="input" value={justification} onChange={(event) => setJustification(event.target.value)} placeholder="Optional default" />
        </div>
      </div>
      <div className="form-grid" style={{ marginTop: 10 }}>
        <input className="input" value={ticketSystem} onChange={(event) => setTicketSystem(event.target.value)} placeholder="Ticket system" />
        <input className="input" value={ticketNumber} onChange={(event) => setTicketNumber(event.target.value)} placeholder="Ticket number" />
      </div>
      <div className="checkbox-grid" style={{ marginTop: 12 }}>
        {sortedItems.map((item) => (
          <label className="checkbox-option" key={item.id}>
            <input type="checkbox" checked={selectedItemIds.has(item.id)} onChange={() => toggle(item.id)} />
            <span>
              <strong>{getDisplayName(item, settings)}</strong>
              <br />
              <span className="muted">{item.scopeLabel}</span>
            </span>
          </label>
        ))}
      </div>
      <button className="btn primary" style={{ marginTop: 12 }} onClick={() => void saveBundle()} disabled={!name.trim() || !selectedItemIds.size}>
        Save bundle
      </button>
      <div className="panel">
        <h3>Saved bundles</h3>
        {settings.bundles.map((bundle) => (
          <div className="alias-row" key={bundle.id}>
            <div>
              <strong>{bundle.name}</strong>
              <p className="muted">
                {bundle.itemIds.length} item(s)
                {bundle.defaultJustification ? ` / ${bundle.defaultJustification}` : ""}
              </p>
            </div>
            <button className="btn danger" onClick={() => void removeBundle(bundle.id)}>
              Remove
            </button>
          </div>
        ))}
        {!settings.bundles.length ? <p className="muted">No bundles saved yet.</p> : null}
      </div>
    </section>
  );
}

function PreferencesPanel({
  settings,
  onSave
}: {
  settings: QuickPimSettings;
  onSave: (settings: QuickPimSettings, message?: string) => Promise<void>;
}) {
  const [defaultDurationHours, setDefaultDurationHours] = useState(settings.preferences.defaultDurationHours);
  const [defaultSort, setDefaultSort] = useState<SortMode>(settings.preferences.defaultSort);
  const [recentJustificationLimit, setRecentJustificationLimit] = useState(settings.preferences.recentJustificationLimit);

  async function save() {
    await onSave({
      ...settings,
      preferences: {
        ...settings.preferences,
        defaultDurationHours,
        defaultSort,
        recentJustificationLimit
      }
    });
  }

  return (
    <section className="panel">
      <h2>Preferences</h2>
      <div className="form-grid three">
        <div className="field">
          <label>Default duration</label>
          <input className="input" type="number" min="0.5" max="24" step="0.5" value={defaultDurationHours} onChange={(event) => setDefaultDurationHours(Number(event.target.value))} />
        </div>
        <div className="field">
          <label>Default sort</label>
          <select className="select" value={defaultSort} onChange={(event) => setDefaultSort(event.target.value as SortMode)}>
            <option value="name">Name</option>
            <option value="lastUsed">Last use</option>
            <option value="activationCount">Activation count</option>
            <option value="type">Type</option>
            <option value="scope">Scope</option>
          </select>
        </div>
        <div className="field">
          <label>Recent justification count</label>
          <input className="input" type="number" min="1" max="20" value={recentJustificationLimit} onChange={(event) => setRecentJustificationLimit(Number(event.target.value))} />
        </div>
      </div>
      <button className="btn primary" style={{ marginTop: 12 }} onClick={() => void save()}>
        Save preferences
      </button>
      <div className="panel">
        <h3>Usage counters</h3>
        {Object.entries(settings.usageStatsByItemId).map(([id, stats]) => (
          <div className="settings-row" key={id}>
            <span>
              {id}
              <br />
              <span className="muted">
                {stats.activationCount} activation(s)
                {stats.lastUsedAt ? ` / ${new Date(stats.lastUsedAt).toLocaleString()}` : ""}
              </span>
            </span>
          </div>
        ))}
        <button className="btn danger" onClick={() => void onSave({ ...settings, usageStatsByItemId: {}, activationHistory: [] }, "Usage data reset.")}>
          Reset usage data
        </button>
      </div>
    </section>
  );
}

function DataPanel({
  settings,
  exportText,
  setExportText,
  onSave,
  onClearMessage
}: {
  settings: QuickPimSettings;
  exportText: string;
  setExportText: (value: string) => void;
  onSave: (settings: QuickPimSettings, message?: string) => Promise<void>;
  onClearMessage: () => void;
}) {
  async function importSettings() {
    onClearMessage();
    const parsed = JSON.parse(exportText) as Partial<QuickPimSettings>;
    await onSave(mergeSettings(parsed), "Settings imported.");
  }

  return (
    <section className="panel">
      <h2>Import / Export</h2>
      <p className="muted">Settings are stored locally in Chrome storage under {SETTINGS_KEY}.</p>
      <textarea className="textarea code-box" value={exportText} onChange={(event) => setExportText(event.target.value)} />
      <div className="button-row" style={{ marginTop: 10 }}>
        <button className="btn" onClick={() => setExportText(JSON.stringify(settings, null, 2))}>
          Refresh export
        </button>
        <button className="btn primary" onClick={() => void importSettings()}>
          Import JSON
        </button>
        <button className="btn danger" onClick={() => void onSave(DEFAULT_SETTINGS, "Settings reset.")}>
          Reset all settings
        </button>
      </div>
    </section>
  );
}

function tabLabel(tab: SettingsTab): string {
  const labels: Record<SettingsTab, string> = {
    about: "About",
    permissions: "Permissions",
    aliases: "Aliases",
    justifications: "Justifications",
    bundles: "Bundles",
    preferences: "Preferences",
    data: "Import / Export"
  };
  return labels[tab];
}

function tabFromHash(): SettingsTab {
  const value = window.location.hash.replace("#", "");
  if (["about", "permissions", "aliases", "justifications", "bundles", "preferences", "data"].includes(value)) {
    return value as SettingsTab;
  }
  return "aliases";
}

async function sendMessage<T>(message: Record<string, unknown>): Promise<T> {
  const response = (await chrome.runtime.sendMessage(message)) as MessageResponse<T>;
  if (!response?.success) {
    throw new Error(response?.error || "QuickPIM background request failed.");
  }
  return response.data as T;
}

createRoot(document.getElementById("root")!).render(<SettingsApp />);
