/** Portable archive validation before any import, separate from storage writes. */
export const ARCHIVE_TABLES=[
 "curriculum_items","catalog_imports","item_progress","review_log",
 "platform_evidence","coaching_preferences","memory_outbox"
] as const;
export type ArchiveTable=typeof ARCHIVE_TABLES[number];
export type ValidArchive={schema:"coding-intuition-learning-archive";version:1;exported_at:string;records:Record<ArchiveTable,Record<string,unknown>[]>};
const object=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==="object"&&!Array.isArray(x);
export function validateLearningArchive(value:unknown):{ok:true;archive:ValidArchive;counts:Record<string,number>}|{ok:false;errors:string[]}{
 const errors:string[]=[];
 if(!object(value))return {ok:false,errors:["Archive must be an object"]};
 if(value.schema!=="coding-intuition-learning-archive"||value.version!==1)errors.push("Unsupported archive version");
 if(typeof value.exported_at!=="string"||!Number.isFinite(Date.parse(value.exported_at)))errors.push("Invalid export timestamp");
 if(!object(value.records))return {ok:false,errors:[...errors,"Missing records"]};
 const counts:Record<string,number>={};
 for(const table of ARCHIVE_TABLES){
   const rows=value.records[table];
   if(!Array.isArray(rows)){errors.push(`Missing table: ${table}`);continue;}
   if(rows.length>100000){errors.push(`Excessive row count: ${table}`);continue;}
   if(rows.some(row=>!object(row))){errors.push(`Malformed row: ${table}`);continue;}
   counts[table]=rows.length;
 }
 if(errors.length)return {ok:false,errors};
 const records=value.records as Record<ArchiveTable,Record<string,unknown>[]>;
 const ids=new Set<string>();
 for(const row of records.curriculum_items){
  if(typeof row.id!=="string" || ids.has(row.id))errors.push("Missing or duplicated curriculum ID");
  else ids.add(row.id);
 }
 for(const table of ["item_progress","review_log"] as const){
  for(const row of records[table]){
   if(typeof row.item_id!=="string"||!ids.has(row.item_id)){errors.push(`Unresolved item reference in ${table}`);break;}
  }
 }
 const evidenceIds=new Set<string>();
 for(const row of records.platform_evidence){
  if(row.item_id!==null&&row.item_id!==undefined&&!ids.has(String(row.item_id))){
    errors.push("Evidence references unknown curriculum item");break;
  }
  const key=`${row.user_id}|${row.source}|${row.provenance_id}`;
  if(evidenceIds.has(key)){errors.push("Duplicate platform evidence provenance");break;}
  evidenceIds.add(key);
 }
 return errors.length?{ok:false,errors}:{ok:true,archive:value as ValidArchive,counts};
}
export function makeRestorePlan(value:unknown){
 const result=validateLearningArchive(value);
 if(!result.ok)return result;
 return {ok:true,mode:"dry_run_only" as const,counts:result.counts,
  warning:"Archive validated. No records changed; restoring requires a separate owner-authorized, transactional workflow."};
}
