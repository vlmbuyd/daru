export type Item = {deadline?:boolean; routine?:boolean; category?:string; color?:string; monthly?:boolean; id:string; title:string; kind:'task'|'event'|'note'; date:string; time:string; duration:number; list:string; tags:string; priority:'보통'|'높음'; done:boolean; source:string; updatedAt:string};
export const today = (now=new Date()) => new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
export const addDays=(date:string,n:number)=>new Date(Date.parse(date+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
export function validDate(s:string){return /^\d{4}-\d{2}-\d{2}$/.test(s)&&!isNaN(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;}
export function blank(date='',time=''):Item{return {id:crypto.randomUUID(),title:'',kind:time?'event':'task',date,time,duration:60,list:'받은함',tags:'',priority:'보통',done:false,source:'직접 입력',updatedAt:new Date().toISOString()};}
export function parse(line:string,base=today()):{item:Item; warnings:string[]}{
 const item=blank(); item.title=line.trim();item.routine=/매일|매주|루틴|반복/.test(line);item.deadline=/마감/.test(line); item.source=line; const warnings:string[]=[];
 item.kind=/^(메모|아이디어)\s*[:：]/.test(line)?'note':/회의|약속|미팅/.test(line)?'event':'task';
 const dates:string[]=[]; for(const [word,n] of [['오늘',0],['내일',1],['모레',2]] as const)if(line.includes(word))dates.push(addDays(base,n));
 const absolute=line.match(/\d{4}-\d{2}-\d{2}/g)||[];for(const date of absolute){if(validDate(date))dates.push(date);else warnings.push('유효하지 않은 날짜입니다.');}
 if(new Set(dates).size===1)item.date=dates[0];else if(dates.length>1)warnings.push('날짜 표현이 충돌합니다. 날짜를 골라 주세요.');
 if(/다음|이번|주말|요일|\d+월|\d+일/.test(line.replace(/\d{4}-\d{2}-\d{2}/g,'')))warnings.push('상대 날짜·요일·연도 없는 날짜는 직접 확인해 주세요.');
 const times=[...line.matchAll(/(?:(오전|오후)\s*)?(\d{1,2})(?::(\d{2})|시(?:\s*(\d{1,2})분)?)/g)];
 if(times.length===1){const [,amp,h,m,m2]=times[0];let hour=Number(h);const minute=Number(m||m2||0);if(hour>23||minute>59||(amp&&(hour<1||hour>12)))warnings.push('시간 범위를 확인해 주세요.');else if(!amp&&hour>=1&&hour<=12&&!m)warnings.push('오전·오후가 모호합니다. 시간을 골라 주세요.');else {if(amp)hour=hour%12+(amp==='오후'?12:0);item.time=`${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`;}}
 else if(times.length>1)warnings.push('여러 시간 표현은 직접 시작 시각과 길이를 정해 주세요.');
 if(/아침|저녁|점심|밤|쯤|언젠가/.test(line))warnings.push('모호한 시간 표현을 확인해 주세요.');
 if(item.time&&!item.date)warnings.push('시간에 해당하는 날짜를 지정해 주세요.');
 if(item.kind==='note'){item.date='';item.time='';}
 return {item,warnings};
}
export function validate(items:unknown): asserts items is Item[]{if(!Array.isArray(items)||items.length>10000)throw Error('잘못된 데이터');const ids=new Set();for(const x of items){if((x?.category!==undefined&&typeof x.category!=='string')||(x?.color!==undefined&&!/^#[0-9a-fA-F]{6}$/.test(x.color))||(x?.monthly!==undefined&&typeof x.monthly!=='boolean')||(x?.routine!==undefined&&typeof x.routine!=='boolean')||(x?.deadline!==undefined&&typeof x.deadline!=='boolean'))throw Error('분류 설정을 확인해 주세요.');if(!x||typeof x.id!=='string'||ids.has(x.id)||typeof x.title!=='string'||!x.title.trim()||x.title.length>2000||!['task','event','note'].includes(x.kind)||typeof x.date!=='string'||(x.date&&!validDate(x.date))||typeof x.time!=='string'||(x.time&&(!x.date||!/^([01]\d|2[0-3]):[0-5]\d$/.test(x.time)))||!Number.isInteger(x.duration)||x.duration<15||x.duration>1440||typeof x.done!=='boolean'||!['보통','높음'].includes(x.priority)||['list','tags','source','updatedAt'].some(k=>typeof x[k]!=='string'))throw Error('항목의 제목·날짜·시간을 확인해 주세요.');ids.add(x.id);}}
export function matches(x:Item,filter:string,base=today()){const monday=addDays(base,-((new Date(base+'T12:00:00Z').getUTCDay()+6)%7));return filter==='전체'||filter==='오늘'&&x.date===base||filter==='이번 주'&&x.date>=monday&&x.date<=addDays(monday,6)||filter==='날짜 없음'&&!x.date;}
export function overlaps(item:Item,items:Item[]){const min=(t:string)=>Number(t.slice(0,2))*60+Number(t.slice(3));return !!item.time&&items.some(x=>x.id!==item.id&&!x.done&&x.date===item.date&&x.time&&min(item.time)<min(x.time)+x.duration&&min(x.time)<min(item.time)+item.duration);}
export type DragMode='move'|'resize'|'resize-start';
export const minutes=(time:string)=>Number(time.slice(0,2))*60+Number(time.slice(3));
export const clock=(value:number)=>`${String(Math.floor(value/60)).padStart(2,'0')}:${String(value%60).padStart(2,'0')}`;
export function changeTime(item:Item,mode:DragMode,date:string,minute:number):Item{const next={...item,updatedAt:new Date().toISOString()};minute=Math.round(minute/15)*15;if(mode==='move'){if(minute+item.duration>1440)throw Error('다음 날까지 이어지는 이동은 아직 지원하지 않아요.');if(minute<0||minute>1425)throw Error('시작 시간을 확인해 주세요.');next.date=date;next.time=clock(minute);}else{if(!item.time||date!==item.date)throw Error('같은 날짜 안에서 조절해 주세요.');const start=minutes(item.time),end=start+item.duration;if(mode==='resize-start'){if(minute<0||minute>end-15||minute>1425)throw Error('시작은 종료보다 빨라야 해요.');next.time=clock(minute);next.duration=end-minute;}else{if(minute<start+15||minute>1440)throw Error('종료는 시작보다 늦어야 해요.');next.duration=minute-start;}}validate([next]);return next;}
export const categories={공부:'#70879D',취업:'#887998',프로젝트:'#708D7C',생활:'#9B876E',미분류:'#899098'} as const;
export function monthShift(month:string,delta:number){const [y,m]=month.split('-').map(Number);const d=new Date(Date.UTC(y,m-1+delta,1));return d.toISOString().slice(0,7);}
export function monthDates(month:string){const first=month+'-01';const offset=new Date(first+'T12:00:00Z').getUTCDay();return Array.from({length:42},(_,i)=>addDays(first,i-offset));}
export function inMonthView(x:Item){return x.monthly??(!x.routine&&(x.kind==='event'||x.priority==='높음'||!!x.deadline));}
