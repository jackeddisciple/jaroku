// Regression guard for the streaming protocol parser.
//
// The parser is fed arbitrary chunk boundaries by the network, and the failure mode is
// silent: a boundary landing inside a delimiter corrupts file contents rather than throwing.
// A newline-leak bug exactly like that was caught here before it ever cost an API call.
//
//   npm run test:protocol

import { FileProtocolParser } from "./fileProtocol.ts";

const SAMPLE =
  `Here are the files:\n` +
  `<<<FILE path="agent.py">>>\nline one\nline two\n<<<ENDFILE>>>\n` +
  `<<<FILE path="tools/__init__.py">>>\nTOOLS = []\n<<<ENDFILE>>>`;

function run(chunks: string[]) {
  const files: Record<string, string> = {};
  let order: string[] = [];
  const p = new FileProtocolParser((e) => {
    if (e.type === "file_start") { files[e.path] = ""; order.push(`start:${e.path}`); }
    if (e.type === "file_delta") files[e.path] += e.text;
    if (e.type === "file_end") order.push(`end:${e.path}`);
  });
  for (const c of chunks) p.push(c);
  return { files, order, err: p.finish() };
}

const expected = { "agent.py": "line one\nline two\n", "tools/__init__.py": "TOOLS = []\n" };
const scenarios: [string, string[]][] = [
  ["one chunk", [SAMPLE]],
  ["char-by-char", SAMPLE.split("")],
  ["split mid-close-delim", [SAMPLE.slice(0, 55), SAMPLE.slice(55)]],
  ["3-char chunks", SAMPLE.match(/.{1,3}/gs)!],
  ["17-char chunks", SAMPLE.match(/.{1,17}/gs)!],
];

let fail = 0;
for (const [name, chunks] of scenarios) {
  const { files, order, err } = run(chunks);
  const ok = JSON.stringify(files) === JSON.stringify(expected) && err === null &&
    order.join(",") === "start:agent.py,end:agent.py,start:tools/__init__.py,end:tools/__init__.py";
  if (!ok) { fail++; console.log(`  FAIL ${name}`, JSON.stringify(files), err, order); }
  else console.log(`  ok   ${name}`);
}

// truncation must be detected, not silently accepted
const trunc = run([`<<<FILE path="agent.py">>>\nhalf a file`]);
console.log(trunc.err ? `  ok   truncation detected: ${trunc.err}` : (fail++, "  FAIL truncation not detected"));
const empty = run(["just prose, no files at all"]);
console.log(empty.err ? `  ok   no-files detected: ${empty.err}` : (fail++, "  FAIL no-files not detected"));

// --- edit-flow additions: prose capture + allowEmpty ---------------------------------

// Prose before the first block must be recoverable (it's the edit summary line), across
// arbitrary chunk boundaries.
for (const [name, chunks] of scenarios) {
  const p = new FileProtocolParser(() => {});
  for (const c of chunks) p.push(c);
  p.finish();
  // Prose = text before the first block + the newline between the two blocks. Consumers
  // read the first non-empty line (the edit summary), so inter-block whitespace is fine.
  const ok = p.prose === "Here are the files:\n\n";
  if (!ok) { fail++; console.log(`  FAIL prose (${name}): ${JSON.stringify(p.prose)}`); }
  else console.log(`  ok   prose captured (${name})`);
}

// Long prose (beyond the partial-delimiter tail) must be captured in full, not just the tail.
{
  const long = "x".repeat(500) + ` end of summary\n<<<FILE path="a.py">>>\nbody\n<<<ENDFILE>>>`;
  const p = new FileProtocolParser(() => {});
  for (const c of long.match(/.{1,7}/gs)!) p.push(c);
  p.finish();
  const ok = p.prose === "x".repeat(500) + " end of summary\n";
  if (!ok) { fail++; console.log(`  FAIL long prose: len=${p.prose.length}`); }
  else console.log("  ok   long prose captured");
}

// A zero-file response is valid for edits (allowEmpty) and its prose is kept.
{
  const p = new FileProtocolParser(() => {});
  p.push("Nothing to change: the tool already has a LIMIT clause.");
  const err = p.finish({ allowEmpty: true });
  const ok = err === null && p.prose === "Nothing to change: the tool already has a LIMIT clause.";
  if (!ok) { fail++; console.log(`  FAIL allowEmpty: err=${err} prose=${JSON.stringify(p.prose)}`); }
  else console.log("  ok   allowEmpty accepts zero files, keeps prose");
}

// Truncation is still an error even with allowEmpty.
{
  const p = new FileProtocolParser(() => {});
  p.push(`<<<FILE path="agent.py">>>\nhalf`);
  const err = p.finish({ allowEmpty: true });
  console.log(err ? `  ok   allowEmpty still detects truncation` : (fail++, "  FAIL allowEmpty missed truncation"));
}

console.log(fail === 0 ? "\nALL CORRECT" : `\n${fail} FAILURES`);
