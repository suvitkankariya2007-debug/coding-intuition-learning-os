import {describe,it,expect} from 'vitest';
import {customProblemRef,importProblemCatalogSchema,makeProblem} from '../src/catalog';
import {buildData,emptySnapshot} from '../src/learning';
import {inferCurriculumConcepts} from '../../src/lib/concept-graph';

const entry={externalId:'task-001',title:'Interval merge exercise',topic:'Intervals',conceptKeys:['intervals']};

describe('learner supplied problem catalogs',()=>{
 it('validates bounded metadata, unique normalized IDs, known concepts and safe links',()=>{
   expect(importProblemCatalogSchema.parse({catalogId:'interview-set',catalogName:'Interview set',items:[entry]}).items).toHaveLength(1);
   expect(()=>importProblemCatalogSchema.parse({catalogId:'x',catalogName:'x',items:[entry]})).toThrow();
   expect(()=>importProblemCatalogSchema.parse({catalogId:'set-one',catalogName:'Set',items:[entry,{...entry,externalId:'task_001'}]})).toThrow();
   expect(()=>importProblemCatalogSchema.parse({catalogId:'set-one',catalogName:'Set',items:[{...entry,conceptKeys:['invented-tag']}]})).toThrow();
   expect(()=>importProblemCatalogSchema.parse({catalogId:'set-one',catalogName:'Set',items:[{...entry,url:'javascript:alert(1)'}]})).toThrow();
   expect(()=>importProblemCatalogSchema.parse({catalogId:'set-one',catalogName:'Set',items:Array.from({length:51},(_,i)=>({...entry,externalId:`task-${i}`}))})).toThrow();
   expect(importProblemCatalogSchema.parse({catalogId:'set-one',catalogName:'Set',items:Array.from({length:50},(_,i)=>({...entry,externalId:`task-${i}`}))}).items).toHaveLength(50);
 });
 it('creates stable, catalog scoped IDs and keeps explicit concepts available to transfer matching and ranking',async()=>{
   const ref=customProblemRef('interview-set','task-001'),same=await makeProblem(ref,'Interval merge exercise','Intervals','intervals','custom_catalog');
   const row={...same,catalogId:'interview-set',externalId:'task-001',conceptKeys:['intervals'] as const};
   expect((await makeProblem(ref,'Renamed title','Intervals','intervals','custom_catalog')).id).toBe(same.id);
   expect(customProblemRef('company-set','task-001')).not.toBe(ref);
   const sharedPrefix='same-prefix-'.repeat(5);
   const longA=customProblemRef('interview-set',sharedPrefix+'alpha'),longB=customProblemRef('interview-set',sharedPrefix+'beta');
   expect(longA).not.toBe(longB);expect(longA.length).toBeLessThanOrEqual(103);
   expect(inferCurriculumConcepts({...row,problemRef:ref})).toContain('intervals');
   const snapshot=emptySnapshot();snapshot.problems=[row as any];
   const data=buildData(snapshot);
   expect(data.roadmap!.some(p=>p.itemId===same.id&&p.problemRef===ref)).toBe(true);
   expect(buildData(snapshot,{catalogId:'interview-set'}).recommendations.map(p=>p.itemId)).toEqual([same.id]);
 });
});
