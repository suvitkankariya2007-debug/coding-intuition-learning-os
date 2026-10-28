// Read-only integration smoke checks. Run in GitHub Actions, never on Vercel.
// Live public endpoints may rate-limit CI egress; failures are surfaced, not hidden.
const lcUser = "suvitk";
const cfUser = "suvitkankariya2007";
const abort = () => AbortSignal.timeout(14000);
const cfUrl = new URL("https://codeforces.com/api/user.status");
cfUrl.searchParams.set("handle",cfUser);
cfUrl.searchParams.set("from","1");
cfUrl.searchParams.set("count","1");
const cf = await fetch(cfUrl, {signal:abort()});
if (!cf.ok) throw Error(`Codeforces HTTP ${cf.status}`);
const cfJson = await cf.json();
if (cfJson.status !== "OK" || !Array.isArray(cfJson.result)) throw Error("Codeforces schema or handle check failed");
console.log("Codeforces user.status public response verified");

const lc = await fetch("https://leetcode.com/graphql/", {
 method:"POST",signal:abort(),headers:{"content-type":"application/json"},
 body:JSON.stringify({
   query:"query recentAcSubmissions($username: String!, $limit: Int!) { recentAcSubmissionList(username: $username, limit: $limit) { id titleSlug timestamp } }",
   variables:{username:lcUser,limit:1}
 })
});
if (!lc.ok) throw Error(`LeetCode HTTP ${lc.status}`);
const lcJson = await lc.json();
if (lcJson.errors || !Array.isArray(lcJson.data?.recentAcSubmissionList)) throw Error("LeetCode recent submissions response unavailable");
console.log("LeetCode public recent accepted GraphQL response verified");
