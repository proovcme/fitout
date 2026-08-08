export function hashSeed(value){let h=2166136261;for(const char of String(value)){h^=char.charCodeAt(0);h=Math.imul(h,16777619)}return h>>>0}
export function createSeededRng(seed){let a=hashSeed(seed)||1;return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
export function pickSeeded(rng,list){return list[Math.floor(rng()*list.length)]}
export function weightedPick(rng,entries){const total=entries.reduce((sum,item)=>sum+item.weight,0),roll=rng()*total;let cursor=0;for(const item of entries){cursor+=item.weight;if(roll<cursor)return item.value}return entries.at(-1)?.value}
