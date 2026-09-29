// FORK(gr): browser copy of `Report.parse` from `api/src/report.ts`.
// The standalone build has no server, so it parses pastes itself.
// `test/standalone.test.ts` checks both give the same result; re-sync this
// file if upstream changes its parser.

export function parse(source: string) {
  const transcriptExpr = new RegExp("<url=showinfo:13..//.+?>(.+?)</url>", "g");

  let names = Array.from(source.matchAll(transcriptExpr), ([, name]) => name);

  if (names.length > 0) {
    return names;
  }

  names = source.trim().split(/[\n\r]+/);

  // Character names must be between 3 and 37 characters long.
  // If a single name isn't to code, we discard the whole input.
  for (const name of names) {
    if (name.length < 3 || name.length > 37) {
      return [];
    }
  }

  return names;
}
