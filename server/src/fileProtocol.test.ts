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

console.log(fail === 0 ? "\nALL CORRECT" : `\n${fail} FAILURES`);
