import { supabase } from "@/integrations/supabase/client";

/** User-scoped, versioned export. No service-role key; Supabase RLS enforces ownership. */
export const EXPORT_TABLES = [
 "curriculum_items","catalog_imports","item_progress","review_log",
 "platform_evidence","coaching_preferences","memory_outbox"
] as const;
export type ExportTable=typeof EXPORT_TABLES[number];
export type LearningArchive={
 schema:"coding-intuition-learning-archive";
 version:1;
 exported_at:string;
 records:Record<ExportTable,unknown[]>;
};
async function allRows(table:ExportTable):Promise<unknown[]>{
 const output:unknown[]=[];
 for(let offset=0;offset<100000;offset+=500){
   const {data,error}=await supabase.from(table).select("*").range(offset,offset+499);
   if(error)throw new Error(`Could not export ${table}: ${error.message}`);
   if(!data)throw Error(`Missing ${table} export response`);
   output.push(...data);
   if(data.length<500)return output;
 }
 throw new Error(`Too many ${table} rows for safe client export`);
}
export async function createLearningArchive():Promise<LearningArchive>{
 const records={} as Record<ExportTable,unknown[]>;
 for(const table of EXPORT_TABLES) records[table]=await allRows(table);
 return {schema:"coding-intuition-learning-archive",version:1,exported_at:new Date().toISOString(),records};
}
export function saveLearningArchive(archive:LearningArchive){
 const json=JSON.stringify(archive,null,2);
 const blob=new Blob([json],{type:"application/json"});
 const url=URL.createObjectURL(blob);
 try{
   const a=document.createElement("a");
   a.href=url;
   a.download=`coding-intuition-learning-${archive.exported_at.slice(0,10)}.json`;
   document.body.appendChild(a);
   a.click();
   a.remove();
 }finally{setTimeout(()=>URL.revokeObjectURL(url),1000);}
}
