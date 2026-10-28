import { describe, expect, it } from "vitest";
import { indexTitles, normalizeCodeforces, normalizeLeetCode } from "./submission-evidence";
describe("submission provenance and matching", () => {
  it("rejects ambiguous titles instead of misattributing submissions", () => {
    const titles = indexTitles([{id:"a",title:"Two Sum"},{id:"b",title:"two-sum"}]);
    expect(titles.has("twosum")).toBe(false);
  });
  it("only attributes known Codeforces problem titles", () => {
    const titles = indexTitles([{id:"a",title:"Watermelon"}]);
    const records = normalizeCodeforces([
      {id:123,creationTimeSeconds:1760000000,verdict:"OK",problem:{name:"Watermelon"}},
      {id:124,creationTimeSeconds:1760000000,verdict:"OK",problem:{name:"Unrelated"}},
    ], titles);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({itemId:"a",source:"codeforces",accepted:true,provenanceId:"cf:123"});
  });
  it("keeps nonaccepted LeetCode outcomes nonaccepted", () => {
    const records = normalizeLeetCode([{id:1,titleSlug:"two-sum",timestamp:"1760000000",statusDisplay:"Wrong Answer"}], new Map([["two-sum","a"]]));
    expect(records).toMatchObject([{accepted:false,provenanceId:"lc:1"}]);
  });
  it("ignores unmatched submissions", () => {
    expect(normalizeLeetCode([{id:1,titleSlug:"unknown",timestamp:"1760000000",statusDisplay:"Accepted"}],new Map())).toEqual([]);
  });
});
