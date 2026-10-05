import {fields,type Dataset,type Field,type Role} from './model';
const aliases:Record<Field,string[]> = {
 employeeId:['사번','직원번호','직원id','employeeid','empid','사원번호'],
 startDate:['입사일','입사일자','hiredate','startdate'],endDate:['퇴사일','퇴사일자','enddate','terminationdate'],
 department:['부서','부서명','최종부서','department','dept'],employmentType:['고용형태','계약형태','employmenttype'],
 recordId:['기록id','기록번호','recordid','거래번호','지급번호','근태번호'],
 date:['기준일','기준월','귀속월','날짜','근태일','지급일','date','paydate'],category:['항목','지급항목','근태구분','휴가구분','category'],
 value:['값','금액','시간','일수','사용량','지급액','amount','value']
};
export function recommendMapping(headers:string[]):Partial<Record<Field,string>> {
 const normalize=(v:string)=>v.toLowerCase().replace(/[\s_\-]/g,'');
 const out:Partial<Record<Field,string>>={};
 for(const key of Object.keys(fields) as Field[]){
  const matches=headers.filter(h=>aliases[key].includes(normalize(h)));
  if(matches.length===1)out[key]=matches[0];
 }
 return out;
}
export function roleFields(role:Role):Field[]{return role==='people'?['employeeId','startDate','endDate','department','employmentType']:['employeeId','recordId','date','category','value','department','employmentType'];}
export function requiredFields(d:Dataset):Field[]{return d.role==='people'?(d.mode==='current'?['employeeId']:['employeeId','startDate','endDate']):['employeeId','date','category','value',...(d.grain==='id'?['recordId' as Field]:[])];}
export function read(d:Dataset,row:Record<string,string>,f:Field){return (row[d.mapping[f]]??'').trim();}
export function parseDate(raw:string,format:Dataset['dateFormat']):string|null {
 if(!raw.trim())return null;
 if(format==='excel' && /^\d+(\.\d+)?$/.test(raw)) {
  const n=Number(raw);if(n<1||n>110000||n===60)return null;
  const date=new Date(Date.UTC(1899,11,30)+Math.floor(n)*86400000);
  return date.toISOString().slice(0,10);
 }
 let y:number,m:number,d:number;
 const p=raw.trim().split(/[-/.]/);
 if(p.length!==3||p.some(x=>!/^\d+$/.test(x)))return null;
 if(p[0].length===4){[y,m,d]=p.map(Number);}
 else if(format==='dmy'){[d,m,y]=p.map(Number);}
 else if(format==='mdy'){[m,d,y]=p.map(Number);}
 else return null;
 if(y<1900||y>2200||m<1||m>12||d<1||d>31)return null;
 const date=new Date(Date.UTC(y,m-1,d));
 if(date.getUTCFullYear()!==y||date.getUTCMonth()!==m-1||date.getUTCDate()!==d)return null;
 return date.toISOString().slice(0,10);
}
export function numeric(raw:string):number|null {
 const s=raw.trim();if(!/^[+-]?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(s))return null;
 const n=Number(s.replaceAll(',',''));return Number.isFinite(n)?n:null;
}
export function monthEnd(month:string){if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))return '';const [y,m]=month.split('-').map(Number);return new Date(Date.UTC(y,m,0)).toISOString().slice(0,10);}
export function priorMonth(month:string){if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))return '';const [y,m]=month.split('-').map(Number);return new Date(Date.UTC(y,m-2,1)).toISOString().slice(0,7);}
export function months(from:string,to:string):string[] {
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(from)||!/^\d{4}-(0[1-9]|1[0-2])$/.test(to)||from>to)return [];
 const out:string[]=[];let cur=from;
 while(cur<=to&&out.length<37){out.push(cur);const[y,m]=cur.split('-').map(Number);cur=new Date(Date.UTC(y,m,1)).toISOString().slice(0,7);}
 return out.length>36?[]:out;
}

