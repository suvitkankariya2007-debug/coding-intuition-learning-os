export type MonitorState={enabled:boolean;intervalMinutes:number;nextRunAt:number|null;taskIndex:number;memoryPagesThisCycle?:number;memoryPage:number;cfCursor:number;consecutiveFailures:number;sourceConfiguration?:Record<string,string>;tasks:Record<string,{status:string;checkedAt:string;lastSuccessAt?:string;lastCompletedAt?:string;failureCount?:number;durationMs?:number;coverage?:string;historyComplete?:boolean}>;lastRunAt?:string;lastSuccessAt?:string;credentialMode?:'local'|'encrypted'};
export const initialMonitor=():MonitorState=>({enabled:false,intervalMinutes:30,nextRunAt:null,taskIndex:0,memoryPage:1,cfCursor:1,consecutiveFailures:0,tasks:{}});
/** Account changes discovered by memory sync must reset cursors before the next poll too. */
export function reconcileMonitorSources(m:MonitorState,current:Record<string,string>){
 if(m.sourceConfiguration){for(const source of new Set([...Object.keys(m.sourceConfiguration),...Object.keys(current)])){if(m.sourceConfiguration[source]!==current[source]){delete m.tasks[source];m.taskIndex=0;if(source==='codeforces')m.cfCursor=1;}}}
 m.sourceConfiguration=current;return m;
}
