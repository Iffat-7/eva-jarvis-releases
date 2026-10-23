// EVA — Google Workspace Tools
import { executeAppAction } from "../auth/composioTools";
import type { ToolDescriptor } from "./toolRegistry";

// ---------------------------------------------------------------------------
// GMAIL TOOLS
// ---------------------------------------------------------------------------

const GMAIL_FETCH_EMAILS = "GMAIL_FETCH_EMAILS";
const GMAIL_SEND_EMAIL = "GMAIL_SEND_EMAIL";
const GMAIL_DRAFT_EMAIL = "GMAIL_DRAFT_EMAIL";
const GMAIL_SEARCH_EMAILS = "GMAIL_SEARCH_EMAILS";
const GMAIL_GET_EMAIL = "GMAIL_GET_EMAIL";

const gmailTools = [
  {
    name: GMAIL_FETCH_EMAILS,
    purpose: "Fetch emails from inbox with search filters.",
    permission: "gmail_read",
    riskLevel: 0,
    timeoutMs: 30_000,
    maxRetries: 1,
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Gmail search query" },
        maxResults: { type: "integer", minimum: 1, maximum: 100, default: 20 },
        pageToken: { type: "string", description: "Pagination token" },
      },
      required: ["query"],
      additionalProperties: false,
    } as const,
  },
];

// ---------------------------------------------------------------------------
// CALENDAR TOOLS
// ---------------------------------------------------------------------------

const CALENDAR_LIST_EVENTS = "CALENDAR_LIST_EVENTS";
const CALENDAR_CREATE_EVENT = "CALENDAR_CREATE_EVENT";
const CALENDAR_SEARCH_EVENTS = "CALENDAR_SEARCH_EVENTS";
const CALENDAR_GET_EVENT = "CALENDAR_GET_EVENT";

const calendarTools = [
  {
    name: CALENDAR_LIST_EVENTS,
    purpose: "List upcoming calendar events.",
    permission: "calendar_read",
    riskLevel: 0,
    timeoutMs: 30_000,
    maxRetries: 1,
    inputSchema: {
      type: "object",
      properties: {
        maxResults: { type: "integer", minimum: 1, maximum: 50, default: 20 },
        timeMin: { type: "string", format: "date-time" },
        timeMax: { type: "string", format: "date-time" },
        q: { type: "string" },
        singleEvents: { type: "boolean", default: true },
      },
      required: [],
      additionalProperties: false,
    } as const,
  },
];

// ---------------------------------------------------------------------------
// EXPORT STUBS
// ---------------------------------------------------------------------------

export const GOOGLE_TOOLS = [
  ...gmailTools,
  ...calendarTools,
  ...driveTools,
  ...sheetsTools,
] as const;
export type GoogleToolName =
  | typeof GMAIL_FETCH_EMAILS
  | typeof GMAIL_SEND_EMAIL
  | typeof GMAIL_DRAFT_EMAIL
  | typeof GMAIL_SEARCH_EMAILS
  | typeof GMAIL_GET_EMAIL
  | typeof CALENDAR_LIST_EVENTS
  | typeof CALENDAR_SEARCH_EVENTS
  | typeof CALENDAR_CREATE_EVENT
  | typeof CALENDAR_GET_EVENT
  | typeof DRIVE_LIST_FILES
  | typeof DRIVE_GET_FILE
  | typeof DRIVE_CREATE_FOLDER
  | typeof DRIVE_CREATE_DOC
  | typeof DRIVE_SEARCH_FILES
  | typeof SHEETS_READ_SPREADSHEET
  | typeof SHEETS_CREATE_SPREADSHEET
  | typeof SHEETS_ADD_ROWS
  | typeof SHEETS_UPDATE_CELL
  | typeof SHEETS_SEARCH_VALUES;
export const googleToolMap = new Map();

// ---------------------------------------------------------------------------
// EXECUTION HANDLER
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// GOOGLE DRIVE TOOLS
// ---------------------------------------------------------------------------

const DRIVE_LIST_FILES = "DRIVE_LIST_FILES";
const DRIVE_GET_FILE = "DRIVE_GET_FILE";
const DRIVE_CREATE_FOLDER = "DRIVE_CREATE_FOLDER";
const DRIVE_CREATE_DOC = "DRIVE_CREATE_DOC";
const DRIVE_SEARCH_FILES = "DRIVE_SEARCH_FILES";

const driveTools = [
  {
    name: DRIVE_LIST_FILES,
    purpose: "List files and folders in Google Drive.",
    permission: "drive_read",
    riskLevel: 0,
    timeoutMs: 30_000,
    maxRetries: 1,
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query for filename" },
        orderBy: { type: "string", description: "Order results by" },
        fields: { type: "string", description: "Fields to return" },
        pageSize: { type: "integer", minimum: 1, maximum: 100, default: 20 },
      },
      required: [],
      additionalProperties: false,
    } as const,
  },
  {
    name: DRIVE_GET_FILE,
    purpose: "Get metadata for a specific Drive file or folder.",
    permission: "drive_read",
    riskLevel: 0,
    timeoutMs: 30_000,
    maxRetries: 1,
    inputSchema: {
      type: "object",
      properties: {
        fileId: { type: "string", description: "Google Drive file or folder ID" },
      },
      required: ["fileId"],
      additionalProperties: false,
    } as const,
  },
  {
    name: DRIVE_CREATE_FOLDER,
    purpose: "Create a new folder in Google Drive.",
    permission: "drive_write",
    riskLevel: 1,
    timeoutMs: 30_000,
    maxRetries: 1,
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Folder name" },
        parentId: { type: "string", description: "Parent folder ID" },
      },
      required: ["name"],
      additionalProperties: false,
    } as const,
  },
  {
    name: DRIVE_CREATE_DOC,
    purpose: "Create a new Google Doc in Drive.",
    permission: "drive_write",
    riskLevel: 1,
    timeoutMs: 30_000,
    maxRetries: 1,
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Document title" },
        parents: {
          type: "array",
          items: { type: "string", description: "Folder ID" },
        },
      },
      required: ["title"],
      additionalProperties: false,
    } as const,
  },
  {
    name: DRIVE_SEARCH_FILES,
    purpose: "Search for files in Google Drive.",
    permission: "drive_read",
    riskLevel: 0,
    timeoutMs: 30_000,
    maxRetries: 1,
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query string" },
        pageSize: { type: "integer", minimum: 1, maximum: 100, default: 20 },
      },
      required: ["query"],
      additionalProperties: false,
    } as const,
  },
];

// Append drive tools to the exported list
GOOGLE_TOOLS.push(...driveTools);

// ---------------------------------------------------------------------------
// GOOGLE SHEETS TOOLS
// ---------------------------------------------------------------------------

const SHEETS_READ_SPREADSHEET = "SHEETS_READ_SPREADSHEET";
const SHEETS_CREATE_SPREADSHEET = "SHEETS_CREATE_SPREADSHEET";
const SHEETS_ADD_ROWS = "SHEETS_ADD_ROWS";
const SHEETS_UPDATE_CELL = "SHEETS_UPDATE_CELL";
const SHEETS_SEARCH_VALUES = "SHEETS_SEARCH_VALUES";

const sheetsTools = [
  {
    name: SHEETS_READ_SPREADSHEET,
    purpose: "Read a Google Spreadsheet.",
    permission: "sheets_read",
    riskLevel: 0,
    timeoutMs: 30_000,
    maxRetries: 1,
    inputSchema: {
      type: "object",
      properties: {
        spreadsheetId: { type: "string", description: "Spreadsheet ID" },
        sheetName: { type: "string", description: "Sheet name" },
      },
      required: ["spreadsheetId"],
      additionalProperties: false,
    } as const,
  },
  {
    name: SHEETS_CREATE_SPREADSHEET,
    purpose: "Create a new Google Spreadsheet.",
    permission: "sheets_write",
    riskLevel: 1,
    timeoutMs: 30_000,
    maxRetries: 1,
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Spreadsheet title" },
        hiddenSheets: {
          type: "array",
          items: { type: "string", description: "Sheet names to create as hidden" },
        },
      },
      required: ["title"],
      additionalProperties: false,
    } as const,
  },
  {
    name: SHEETS_ADD_ROWS,
    purpose: "Add rows to a Google Spreadsheet.",
    permission: "sheets_write",
    riskLevel: 1,
    timeoutMs: 30_000,
    maxRetries: 2,
    inputSchema: {
      type: "object",
      properties: {
        spreadsheetId: { type: "string", description: "Spreadsheet ID" },
        sheetName: { type: "string", description: "Sheet name" },
        range: { type: "string", description: "A1 notation range" },
        values: {
          type: "array",
          items: { type: "array", items: { type: "string" } },
        },
        raw: { type: "boolean", default: false },
      },
      required: ["spreadsheetId", "values"],
      additionalProperties: false,
    } as const,
  },
  {
    name: SHEETS_UPDATE_CELL,
    purpose: "Update a cell in a Google Spreadsheet.",
    permission: "sheets_write",
    riskLevel: 1,
    timeoutMs: 30_000,
    maxRetries: 2,
    inputSchema: {
      type: "object",
      properties: {
        spreadsheetId: { type: "string", description: "Spreadsheet ID" },
        sheetName: { type: "string", description: "Sheet name" },
        range: { type: "string", description: "A1 notation range to update" },
        values: {
          type: "array",
          items: { type: "array", items: { type: "string" } },
        },
      },
      required: ["spreadsheetId", "range", "values"],
      additionalProperties: false,
    } as const,
  },
  {
    name: SHEETS_SEARCH_VALUES,
    purpose: "Search for values in a Google Spreadsheet.",
    permission: "sheets_read",
    riskLevel: 0,
    timeoutMs: 30_000,
    maxRetries: 1,
    inputSchema: {
      type: "object",
      properties: {
        spreadsheetId: { type: "string", description: "Spreadsheet ID" },
        sheetName: { type: "string", description: "Sheet name" },
        searchString: { type: "string", description: "String to search for" },
        maxResults: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          default: 10,
        },
      },
      required: ["spreadsheetId", "searchString"],
      additionalProperties: false,
    } as const,
  },
];

// Append sheets tools to the exported list
GOOGLE_TOOLS.push(...sheetsTools);

// ---------------------------------------------------------------------------
// UPDATE GOOGLE TOOL NAME TYPE TO INCLUDE SHEETS
// ---------------------------------------------------------------------------

export type GoogleToolName =
  | typeof GMAIL_FETCH_EMAILS
  | typeof GMAIL_SEND_EMAIL
  | typeof GMAIL_DRAFT_EMAIL
  | typeof GMAIL_SEARCH_EMAILS
  | typeof GMAIL_GET_EMAIL
  | typeof CALENDAR_LIST_EVENTS
  | typeof CALENDAR_SEARCH_EVENTS
  | typeof CALENDAR_CREATE_EVENT
  | typeof CALENDAR_GET_EVENT
  | typeof DRIVE_LIST_FILES
  | typeof DRIVE_GET_FILE
  | typeof DRIVE_CREATE_FOLDER
  | typeof DRIVE_CREATE_DOC
  | typeof DRIVE_SEARCH_FILES
  | typeof SHEETS_READ_SPREADSHEET
  | typeof SHEETS_CREATE_SPREADSHEET
  | typeof SHEETS_ADD_ROWS
  | typeof SHEETS_UPDATE_CELL
  | typeof SHEETS_SEARCH_VALUES;

// ---------------------------------------------------------------------------
// EXECUTION HANDLER
// ---------------------------------------------------------------------------

/**
 * Execute a Google Workspace tool action through the Composio bridge.
 * 
 * This handler resolves the user's own connected connection from the database,
 * never trusts a model-supplied connection ID, and executes the action through
 * Composio v3 API.
 */
async function executeGoogleTool(
  userId: string,
  tool: GoogleToolName,
  args: Record<string, unknown>
): Promise<{ ok: boolean; summary: string; data?: unknown; error?: string }> {
  // Look up the tool descriptor
  const toolDescriptor = googleToolMap.get(tool);
  if (!toolDescriptor) {
    return { ok: false, summary: `Unknown Google tool: ${tool}`, error: "unknown_tool" };
  }

  // Map tool slug to Composio provider and tool slug
  const mapping: Record<string, { provider: string; composioTool: string }> = {
    // GMAIL
    [GMAIL_FETCH_EMAILS]: { provider: "gmail", composioTool: "GMAIL_FETCH_EMAILS" },
    [GMAIL_SEARCH_EMAILS]: { provider: "gmail", composioTool: "GMAIL_SEARCH_EMAILS" },
    [GMAIL_GET_EMAIL]: { provider: "gmail", composioTool: "GMAIL_GET_EMAIL" },
    [GMAIL_DRAFT_EMAIL]: { provider: "gmail", composioTool: "GMAIL_DRAFT_EMAIL" },
    [GMAIL_SEND_EMAIL]: { provider: "gmail", composioTool: "GMAIL_SEND_EMAIL" },
    // CALENDAR
    [CALENDAR_LIST_EVENTS]: { provider: "googlecalendar", composioTool: "CALENDAR_LIST_EVENTS" },
    [CALENDAR_SEARCH_EVENTS]: { provider: "googlecalendar", composioTool: "CALENDAR_SEARCH_EVENTS" },
    [CALENDAR_CREATE_EVENT]: { provider: "googlecalendar", composioTool: "CALENDAR_CREATE_EVENT" },
    [CALENDAR_GET_EVENT]: { provider: "googlecalendar", composioTool: "CALENDAR_GET_EVENT" },
    // DRIVE
    [DRIVE_LIST_FILES]: { provider: "googledrive", composioTool: "DRIVE_LIST_FILES" },
    [DRIVE_GET_FILE]: { provider: "googledrive", composioTool: "DRIVE_GET_FILE" },
    [DRIVE_CREATE_FOLDER]: { provider: "googledrive", composioTool: "DRIVE_CREATE_FOLDER" },
    [DRIVE_CREATE_DOC]: { provider: "googledrive", composioTool: "DRIVE_CREATE_DOC" },
    [DRIVE_SEARCH_FILES]: { provider: "googledrive", composioTool: "DRIVE_SEARCH_FILES" },
    // SHEETS
    [SHEETS_READ_SPREADSHEET]: { provider: "googlesheets", composioTool: "SHEETS_READ_SPREADSHEET" },
    [SHEETS_CREATE_SPREADSHEET]: { provider: "googlesheets", composioTool: "SHEETS_CREATE_SPREADSHEET" },
    [SHEETS_ADD_ROWS]: { provider: "googlesheets", composioTool: "SHEETS_ADD_ROWS" },
    [SHEETS_UPDATE_CELL]: { provider: "googlesheets", composioTool: "SHEETS_UPDATE_CELL" },
    [SHEETS_SEARCH_VALUES]: { provider: "googlesheets", composioTool: "SHEETS_SEARCH_VALUES" },
  };

  const mappingEntry = mapping[tool];
  if (!mappingEntry) {
    return { ok: false, summary: `No Composio mapping for tool: ${tool}`, error: "no_mapping" };
  }

  // Execute through Composio bridge using user's own connection
  // The connection is resolved from the user's own stored connection,
  // never trusts a model-supplied connection ID
  return await executeAppAction(
    userId,
    mappingEntry.provider,
    mappingEntry.composioTool,
    args
  );
}

// ---------------------------------------------------------------------------
// REGISTRATION HELPER
// ---------------------------------------------------------------------------

/**
 * Register all Google Workspace tools with the given tool registry.
 * 
 * This should be called during application initialization to make all
 * Google integrations available to EVA's agent planner.
 */
export function registerGoogleTools(registry: import("./toolRegistry").ToolRegistry): void {
  // Gmail tools
  for (const tool of gmailTools) {
    registry.register(tool);
  }

  // Calendar tools
  for (const tool of calendarTools) {
    registry.register(tool);
  }

  // Drive tools
  for (const tool of driveTools) {
    registry.register(tool);
  }

  // Sheets tools
  for (const tool of sheetsTools) {
    registry.register(tool);
  }
}