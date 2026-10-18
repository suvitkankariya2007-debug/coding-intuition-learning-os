import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { memoryCache } from "@/lib/memory-cache";

/** User-triggered delivery only. Never read or send memories outside leetcode_problems. */
export const syncConsentedMemories = createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .handler(async ({context}) => {
    const key = process.env.SUPERMEMORY_API_KEY;
    const namespace = process.env.SUPERMEMORY_NAMESPACE;
    if (!key) throw new Error("Supermemory key is not configured");
    if (namespace !== "leetcode_problems") throw new Error("Supermemory namespace mismatch; refusing to send");
    const {supabase,userId} = context;
    const {data,error} = await supabase.from("memory_outbox")
      .select("id,summary,status,consent")
      .eq("user_id",userId).eq("consent",true)
      .in("status",["queued_not_connected","failed"])
      .order("created_at",{ascending:true}).limit(5);
    if (error) throw new Error("Unable to load opted-in learning memories");
    let sent = 0;
    const errors:string[] = [];
    for (const row of data) {
      try {
        const response = await fetch("https://api.supermemory.ai/ns/leetcode_problems/document", {
          method:"POST",
          headers:{"Authorization":`Bearer ${key}`,"Content-Type":"application/json"},
          body:JSON.stringify({
            id:`learning_${row.id.replace(/-/g,"")}`,
            content:row.summary.slice(0,2000),
            group:{id:userId},
            metadata:{source:"coding-intuition-learning-os",userId,consent:true},
            taskType:"memory",
          }),
          signal:AbortSignal.timeout(15000),
        });
        if (!response.ok) throw new Error(`Supermemory returned HTTP ${response.status}`);
        const {error:markError} = await supabase.from("memory_outbox")
          .update({status:"sent"}).eq("id",row.id).eq("user_id",userId);
        if (markError) throw new Error("Stored in Supermemory but failed to acknowledge locally; safe to retry using same ID");
        sent++;
      } catch(e) {
        const reason = e instanceof Error ? e.message : "Unknown delivery problem";
        errors.push(reason);
        await supabase.from("memory_outbox").update({status:"failed"})
          .eq("id",row.id).eq("user_id",userId);
      }
    }
    if(sent>0)memoryCache.invalidate(userId);
    return {sent, pending:data.length - sent, errors};
  });
