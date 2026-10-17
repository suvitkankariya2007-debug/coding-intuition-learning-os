// Explicit release-only utility: verify already-applied Lovable Cloud migrations
// and reconcile the Drizzle ledger without re-running destructive DDL.
// Defaults to read-only dry-run; requires a dedicated migration connection.
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import postgres from "postgres";
const tags=[
 "0000_migration","0001_migration","0002_platform_evidence","0003_memory_ack",
 "0004_github_solution_location","0005_github_evidence_guard",
 "0006_non_destructive_canonical_reconciliation","0007_atomic_learning_reviews"
];
const journal=JSON.parse(readFileSync(new URL("../drizzle/migrations/meta/_journal.json",import.meta.url),"utf8"));
if(JSON.stringify(journal.entries.map(e=>e.tag))!==JSON.stringify(tags))throw Error("Migration journal changed; audit required");
const expected=tags.map(tag=>{
 const sql=readFileSync(new URL(`../drizzle/migrations/${tag}.sql`,import.meta.url),"utf8");
 return {tag,hash:createHash("sha256").update(sql).digest("hex"),
   timestamp:journal.entries.find(e=>e.tag===tag)?.when};
});
const url=process.env.LOVABLE_DB_MIGRATION_URL;
if(!url)throw Error("LOVABLE_DB_MIGRATION_URL missing; did not modify database");
const client=postgres(url,{max:1,prepare:false});
try{
 await client.begin(async tx=>{
  const rows=await tx`SELECT id,hash,created_at FROM drizzle.__drizzle_migrations ORDER BY id FOR UPDATE`;
  if(rows.length<2||rows.length>expected.length)throw Error("Unexpected migration ledger size");
  for(let i=0;i<rows.length;i++){
   if(rows[i].hash!==expected[i].hash||Number(rows[i].created_at)!==expected[i].timestamp)
     throw Error(`Existing migration ledger entry ${i} does not match repository`);
  }
  const [status]=await tx`SELECT
    (SELECT count(*)::integer FROM public.curriculum_items) AS all_items,
    (SELECT count(*)::integer FROM public.curriculum_items WHERE is_active) AS active_items,
    (SELECT count(*)::integer FROM pg_constraint WHERE conrelid='public.platform_evidence'::regclass AND conname IN ('platform_evidence_code_url_source','platform_evidence_github_not_accepted')) AS evidence_guards,
    EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='platform_evidence' AND column_name='code_url') AS github_url,
    EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='memory_outbox' AND policyname='own outbox status update') AS memory_ack,
    (SELECT count(*)::integer FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('reconcile_canonical_188','record_learning_review')) AS learning_functions`;
  if(status.all_items!==440||status.active_items!==188||status.evidence_guards!==2||
      !status.github_url||!status.memory_ack||status.learning_functions!==2)
    throw Error("Live database objects do not match baseline; no ledger edits allowed");
  const missing=expected.slice(rows.length);
  console.log(JSON.stringify({alreadyRegistered:rows.length,verifiedMissing:missing.map(e=>e.tag)},null,2));
  if(process.env.CONFIRM_RECONCILE_MIGRATIONS!=="yes"){
   console.log("Dry run only. Set CONFIRM_RECONCILE_MIGRATIONS=yes for a separately approved change.");
   return;
  }
  for(const row of missing){
   await tx`INSERT INTO drizzle.__drizzle_migrations(hash,created_at) VALUES(${row.hash},${row.timestamp})`;
  }
  console.log("Migration ledger reconciled atomically; no application tables were changed.");
 });
}finally{await client.end()}
