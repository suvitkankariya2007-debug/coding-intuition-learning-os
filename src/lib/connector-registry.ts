/** Connector contract independent of any coding platform or backend. */
export type ConnectorContext={userId:string; now:string};
export type SourceEvidence={
 source:string; externalId:string; problemKey:string; observedAt:string;
 verdict:string|null; accepted:boolean; codeUrl?:string|null
};
export type ConnectorBatch={
 records:SourceEvidence[]; nextCursor:string|null; complete:boolean;
 warnings:string[]
};
export type LearningConnector={
 id:string; version:1;
 pull:(ctx:ConnectorContext,cursor:string|null)=>Promise<ConnectorBatch>
};
const safeId=/^[a-z][a-z0-9_-]{1,39}$/;
export class ConnectorRegistry{
 private readonly connectors=new Map<string,LearningConnector>();
 register(connector:LearningConnector){
  if(!safeId.test(connector.id)||connector.version!==1)throw new Error("Unsupported connector contract");
  if(this.connectors.has(connector.id))throw new Error("Connector already registered");
  this.connectors.set(connector.id,connector);
 }
 list(){return [...this.connectors.keys()].sort();}
 async sync(id:string,ctx:ConnectorContext,cursor:string|null=null):Promise<ConnectorBatch>{
  const source=this.connectors.get(id);
  if(!source)throw new Error("Unknown connector");
  const batch=await source.pull(ctx,cursor);
  if(!batch || !Array.isArray(batch.records)||!Array.isArray(batch.warnings)||
     typeof batch.complete!=="boolean"||
     (batch.nextCursor!==null && typeof batch.nextCursor!=="string"))
    throw new Error("Invalid connector batch");
  if(batch.records.length>1000||batch.warnings.length>20)throw new Error("Oversized connector batch");
  const ids=new Set<string>();
  for(const r of batch.records){
    if(r.source!==id||!r.externalId||!r.problemKey||!Number.isFinite(Date.parse(r.observedAt))||
       typeof r.accepted!=="boolean"||ids.has(r.externalId))
      throw new Error("Invalid or duplicate evidence record");
    ids.add(r.externalId);
  }
  if(batch.complete && batch.nextCursor!==null)throw new Error("Completed connector supplied continuation cursor");
  if(!batch.complete && (!batch.nextCursor||batch.nextCursor===cursor))
    throw new Error("Connector continuation cursor did not advance");
  return batch;
 }
}
