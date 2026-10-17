// Verify every SQL migration is registered exactly once before deploy.
import { readFileSync, readdirSync } from "node:fs";
const folder = new URL("../drizzle/migrations/", import.meta.url);
const journal = JSON.parse(readFileSync(new URL("meta/_journal.json", folder), "utf8"));
const sql = readdirSync(folder).filter(x => /^\d{4}_[\w-]+\.sql$/.test(x)).map(x => x.slice(0,-4)).sort();
const tags = journal.entries.map(e => e.tag);
if (new Set(tags).size !== tags.length) throw Error("Duplicate migration tag in Drizzle journal");
if (JSON.stringify(sql) !== JSON.stringify([...tags].sort()))
  throw Error("Migration journal and SQL files differ: SQL="+sql.join(",")+" journal="+tags.join(","));
if (!journal.entries.every((e,i)=>e.idx===i)) throw Error("Migration journal indexes are not sequential");
console.log("Migration journal verified:", tags.length, "SQL migrations");
