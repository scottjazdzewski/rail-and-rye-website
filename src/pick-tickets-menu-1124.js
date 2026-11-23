// Date-scoped public wagering menu transcribed from 11/24/2026 TimeformUS racecards.
// Contains NO TRI probabilities, selected runners, paid outputs or scoring receipts.
// Input archive: 1124 TIMEFORM.zip (SHA-256:
// 7395a45700a3aa4fdf9f3dff05f393f7079adf4deb30cb2413aea7a78d4345c3).
// Freeze official ranges and minimum units independently of November 23.
export const PICK_DAY_1124="2026-11-24";
const add=(track,n,starts,unit_cents,name)=>starts.map(start=>({
 track,name:name||"Pick "+n,start_race:start,end_race:start+n-1,unit_cents
}));
export const PICK_TRACK_COUNTS_1124=Object.freeze({
 "Delta Downs":8,"Finger Lakes":8,"Mahoning Valley":8,
 "Mountaineer":8,"Parx Racing":9,"Zia Park":10
});
export const PICK_MENU_1124=Object.freeze([
 ...add("Delta Downs",3,[1,2,3,4,5,6],50),
 ...add("Delta Downs",4,[2,5],50),
 ...add("Delta Downs",5,[1,4],50),
 ...add("Finger Lakes",5,[1,4],50),
 ...add("Finger Lakes",3,[2,3,6],50),
 ...add("Finger Lakes",4,[3,5],50),
 ...add("Mahoning Valley",3,[1,2,3,4,5,6],50),
 ...add("Mahoning Valley",5,[1,4],50),
 ...add("Mahoning Valley",4,[5],50),
 ...add("Mahoning Valley",6,[3],20,"Buckeye Pick 6"),
 ...add("Mountaineer",4,[1,5],50),
 ...add("Mountaineer",3,[2,6],100),
 ...add("Mountaineer",5,[4],50),
 ...add("Parx Racing",3,[1,2,3,4,5,6,7],100),
 ...add("Parx Racing",4,[1,2,4,6],50),
 ...add("Parx Racing",5,[5],50,"Philly Big 5"),
 ...add("Zia Park",5,[1,6],50),
 ...add("Zia Park",4,[2,7],50),
 ...add("Zia Park",3,[3,8],50)
]);
