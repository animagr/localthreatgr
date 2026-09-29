// FORK(gr): guard tests for the standalone single-file build (see FORK.md).
// Run with `npm test` in `client/`. The parser parity test imports the
// server's parser, so `npm ci` in `api/` must have been run first.

import { deepEqual, equal, match, ok, rejects } from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { Report as ServerReport } from "../../api/src/report.ts";
import {
  createId,
  createReportStore,
  maxReports,
} from "../src/standalone/api.ts";
import { parse } from "../src/standalone/parse.ts";

const clientDir = join(import.meta.dirname, "..");

function readClientFile(path: string) {
  return readFileSync(join(clientDir, path), "utf-8");
}

function createMemoryStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (index) => Array.from(items.keys())[index] ?? null,
    removeItem: (key) => void items.delete(key),
    setItem: (key, value) => void items.set(key, String(value)),
  };
}

const transcript =
  "[14:34:02] Username > <url=showinfo:1300//0000000000>Player 1</url>  " +
  "<url=showinfo:1300//0000000000>Player 2</url>  <url=showinfo:5//30005208>Ziasad</url>";

const parserSamples = [
  transcript,
  "Alpha\nBeta\nGamma",
  "Alpha\r\nBeta\r\n\r\nGamma\n",
  "Alpha\nBo\nGamma",
  "  Padded Name  \nOther Pilot",
  "A".repeat(37),
  "A".repeat(38),
  "abc",
  "",
  "<url=showinfo:1376//123>Pilot Alt</url> and <url=showinfo:2//98000001>Some Corp</url>",
];

describe("standalone parser", () => {
  test("matches the server's Report.parse", () => {
    for (const sample of parserSamples) {
      deepEqual(
        parse(sample),
        ServerReport.parse(sample),
        JSON.stringify(sample),
      );
    }
  });
});

describe("standalone report store", () => {
  test("creates, reads and appends like the server", async () => {
    const { request } = createReportStore(createMemoryStorage());

    const created = await request("POST", "/v1/reports", "Alpha\nBeta\nAlpha");
    deepEqual(created.content, ["Alpha", "Beta"]);
    match(created.createdAt, /^\d{4}-\d{2}-\d{2}T/);

    deepEqual(await request("GET", `/v1/reports/${created.id}`), created);

    const appended = await request(
      "PATCH",
      `/v1/reports/${created.id}`,
      "Beta\nGamma",
    );
    deepEqual(appended.content, ["Alpha", "Beta", "Gamma"]);
    equal(appended.createdAt, created.createdAt);
    deepEqual(await request("GET", `/v1/reports/${created.id}`), appended);
  });

  test("rejects what the server rejects", async () => {
    const { request } = createReportStore(createMemoryStorage());

    await rejects(request("POST", "/v1/reports", " a "), /too short/);
    await rejects(
      request("POST", "/v1/reports", "Alpha\nBo"),
      /couldn't be parsed/,
    );
    await rejects(request("GET", "/v1/reports/missing12345"), /not found/);
    await rejects(
      request("PATCH", "/v1/reports/missing12345", "Alpha"),
      /not found/,
    );
    await rejects(request("DELETE", "/v1/reports/missing12345"), /not allowed/);
    await rejects(request("GET", "/v2/other"), /Not found/);
  });

  test("keeps only the newest reports", async () => {
    const storage = createMemoryStorage();
    const { request } = createReportStore(storage);

    const first = await request("POST", "/v1/reports", "First Pilot");
    for (let i = 0; i < maxReports; i++) {
      await request("POST", "/v1/reports", `Pilot ${i}`);
    }

    await rejects(request("GET", `/v1/reports/${first.id}`), /not found/);
    const stored = JSON.parse(storage.getItem("localthreatgr:reports") ?? "{}");
    equal(Object.keys(stored).length, maxReports);
  });

  test("treats corrupt storage as empty", async () => {
    const storage = createMemoryStorage();
    storage.setItem("localthreatgr:reports", "{not json");
    const { request } = createReportStore(storage);

    const created = await request("POST", "/v1/reports", "Alpha");
    deepEqual(await request("GET", `/v1/reports/${created.id}`), created);
  });

  test("IDs use the server's format", () => {
    for (let i = 0; i < 200; i++) {
      match(createId(), /^[0-9a-zA-Z]{12}$/);
    }
  });
});

describe("upstream touch points", () => {
  test("index.html still loads the entry the standalone build swaps out", () => {
    ok(readClientFile("index.html").includes('src="/src/script.tsx"'));
  });

  test("pages still call the API through the aliased ~/lib/api", () => {
    for (const page of [
      "src/components/Blank.tsx",
      "src/components/Report.tsx",
    ]) {
      ok(readClientFile(page).includes('from "~/lib/api"'), page);
    }
  });

  test("the Share button still copies the pilot list in the standalone build", () => {
    const app = readClientFile("src/components/App.tsx");
    ok(
      app.includes(
        'import { currentReportText } from "~/standalone/api"; // FORK(gr)',
      ),
    );
    // Whitespace-insensitive, so reformatting doesn't trip it.
    ok(
      app
        .replace(/\s+/g, " ")
        .includes(
          'import.meta.env.MODE === "standalone" ? currentReportText() : location.href',
        ),
    );
  });
});
