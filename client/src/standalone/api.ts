// FORK(gr): drop-in replacement for `~/lib/api` in the standalone build.
// `vite.standalone.config.js` aliases `~/lib/api` to this file, so
// `Blank.tsx` and `Report.tsx` keep calling `request()` unchanged, but
// reports live in this browser's localStorage instead of on the API server.
// It mirrors the server routes in `api/src/index.ts`.

import type { Report } from "~/lib/report";
import { parse } from "./parse.ts";

const storageKey = "localthreatgr:reports";

// Oldest reports (by creation time) are dropped beyond this many.
// The History panel only keeps 50, so older ones are unreachable anyway.
export const maxReports = 100;

const idAlphabet =
  "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const idLength = 12;

type Reports = Record<string, Report>;

// Same alphabet and length as the server's nanoid IDs.
export function createId() {
  let id = "";
  const bytes = new Uint8Array(idLength * 2);

  while (id.length < idLength) {
    crypto.getRandomValues(bytes);
    for (const byte of bytes) {
      // Reject values that would bias the modulo (248 = 4 * 62).
      if (byte < 248 && id.length < idLength) {
        id += idAlphabet[byte % idAlphabet.length];
      }
    }
  }

  return id;
}

// Mirrors the server's input checks, including its error messages.
function parseInput(body: string | undefined) {
  if (body === undefined || body.trim().length < 3) {
    throw new Error("Content is too short");
  }

  const names = parse(body);
  if (names.length < 1) {
    throw new Error("Content couldn't be parsed");
  }

  return names;
}

export function createReportStore(storage: Storage) {
  function load(): Reports {
    const raw = storage.getItem(storageKey);
    if (!raw) {
      return {};
    }

    try {
      const reports = JSON.parse(raw) as unknown;
      if (reports && typeof reports === "object" && !Array.isArray(reports)) {
        return reports as Reports;
      }
    } catch {
      // Fall through: a corrupt entry is treated as an empty store.
    }

    return {};
  }

  function save(reports: Reports) {
    const ids = Object.keys(reports);

    if (ids.length > maxReports) {
      ids
        .sort((a, b) =>
          reports[a].createdAt.localeCompare(reports[b].createdAt),
        )
        .slice(0, ids.length - maxReports)
        .forEach((id) => delete reports[id]);
    }

    storage.setItem(storageKey, JSON.stringify(reports));
  }

  function get(id: string) {
    const report = load()[id];
    if (!report) {
      throw new Error("Report not found");
    }
    return report;
  }

  function create(body: string | undefined) {
    const content = Array.from(new Set(parseInput(body)));
    const reports = load();

    let id = createId();
    while (id in reports) {
      id = createId();
    }

    const report: Report = {
      id,
      createdAt: new Date().toISOString(),
      content,
    };
    reports[id] = report;
    save(reports);

    return report;
  }

  function append(id: string, body: string | undefined) {
    const reports = load();
    const existing = reports[id];
    if (!existing) {
      throw new Error("Report not found");
    }

    const names = parseInput(body);
    const report: Report = {
      ...existing,
      content: Array.from(new Set([...existing.content, ...names])),
    };
    reports[id] = report;
    save(reports);

    return report;
  }

  async function request(method: string, path: string, body?: string) {
    const match = /^\/v1\/reports(?:\/([^/?#]+))?$/.exec(path);
    if (!match) {
      throw new Error("Not found");
    }

    const id =
      match[1] === undefined ? undefined : decodeURIComponent(match[1]);

    if (id === undefined) {
      if (method === "POST") {
        return create(body);
      }
    } else if (method === "GET") {
      return get(id);
    } else if (method === "PATCH") {
      return append(id, body);
    }

    throw new Error("Method not allowed");
  }

  return { request, get };
}

let defaultStore: ReturnType<typeof createReportStore> | undefined;

function store() {
  defaultStore ??= createReportStore(localStorage);
  return defaultStore;
}

export async function request(
  method: string,
  path: string,
  body?: string,
): Promise<Report> {
  return store().request(method, path, body);
}

// Plain-text pilot list of the report currently in the address bar, for
// the Share button (a link to a local file is no use to anyone else).
export function currentReportText() {
  const id = decodeURIComponent(location.hash.replace(/^#?\/?/, ""));
  if (!id) {
    return "";
  }

  try {
    return store().get(id).content.join("\n");
  } catch {
    return "";
  }
}
