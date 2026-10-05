import { z } from 'zod';
export const fields = {
 employeeId: '사번', startDate: '입사일', endDate: '퇴사일', department: '부서', employmentType: '고용형태',
 recordId: '기록 ID', date: '기준일', category: '항목', value: '값'
} as const;
export type Field = keyof typeof fields;
export type Role = 'people' | 'attendance' | 'payroll';
export const roleNames: Record<Role, string> = {people:'인원·입퇴사',attendance:'근태·휴가',payroll:'제공 인건비'};
export const datasetSchema = z.object({
 id:z.string().max(100), name:z.string().max(200), role:z.enum(['people','attendance','payroll']),
 headers:z.array(z.string().max(200)).max(100), rows:z.array(z.record(z.string(),z.string().max(2000))).max(10000),
 mapping:z.record(z.string(),z.string().max(200)), excluded:z.boolean(), confirmed:z.boolean(),
 dateFormat:z.enum(['ymd','dmy','mdy','excel']), unit:z.enum(['hours','days','won','thousand','tenThousand']),
 grain:z.enum(['id','composite']), mode:z.enum(['history','current']),
 coverageStart:z.string().max(10), coverageEnd:z.string().max(10), asOf:z.string().max(10),
 categoryMap:z.record(z.string(),z.enum(['work','overtime','leave','ignore'])),
});
export type Dataset = z.infer<typeof datasetSchema>;
export const filtersSchema = z.object({from:z.string().regex(/^\d{4}-\d{2}$/),to:z.string().regex(/^\d{4}-\d{2}$/),department:z.string().max(200),employmentType:z.string().max(200)});
export type Filters = z.infer<typeof filtersSchema>;
export const chartTypes = ['line','bar','horizontal','pie','table'] as const;
export const cardSchema = z.object({id:z.string().max(80), title:z.string().max(160),type:z.enum(chartTypes),size:z.enum(['normal','wide']),visible:z.boolean()});
export type Card = z.infer<typeof cardSchema>;
export const designSchema = z.object({theme:z.enum(['green','forest','lime']),layout:z.enum(['balanced','focus','compact']),cards:z.array(cardSchema).max(12)});
export type Design = z.infer<typeof designSchema>;
export const reportSchema = z.object({generated:z.string().max(24000),notes:z.string().max(12000),basisKey:z.string().max(80),reviewedKey:z.string().max(80)});
export type Report = z.infer<typeof reportSchema>;
export const workspaceSchema = z.object({
 version:z.literal(1),title:z.string().trim().min(1).max(160),datasets:z.array(datasetSchema).max(24),
 filters:filtersSchema,exitInclusive:z.boolean(),basisConfirmed:z.boolean(),design:designSchema,report:reportSchema,
 retainOriginals:z.boolean(),audit:z.array(z.object({at:z.string().max(40),action:z.string().max(500)})).max(1000),sample:z.boolean(),
});
export type Workspace = z.infer<typeof workspaceSchema>;
export type Issue = {datasetId:string;row?:number;field?:string;severity:'error'|'warning';code:string;message:string;impact:string};
export type Point = {label:string;value:number|null;value2?:number|null};
export type Chart = {id:string;title:string;unit:string;series:string[];points:Point[];recommended:Card['type'];allowed:Card['type'][];reason:string;filter?:'department'|'month'};
export type Metric = {id:string;label:string;value:number|null;unit:string;note:string};
export type Result = {metrics:Metric[];charts:Chart[];notices:string[];issues:Issue[];available:Record<Role,boolean>;reasons:Record<Role,string>;departments:string[];employmentTypes:string[];filters:Filters;basis:string[];key:string;empty:boolean};
export const emptyWorkspace = ():Workspace => ({
 version:1,title:'인사현황 보고서',datasets:[],filters:{from:'2026-07',to:'2026-09',department:'',employmentType:''},
 exitInclusive:true,basisConfirmed:false,design:{theme:'green',layout:'balanced',cards:[]},
 report:{generated:'',notes:'',basisKey:'',reviewedKey:''},retainOriginals:false,audit:[],sample:false
});
export function newDataset(name:string,headers:string[],rows:Record<string,string>[],id:string=crypto.randomUUID()):Dataset {
 return {id,name,headers,rows,role:'people',mapping:{},excluded:false,confirmed:false,dateFormat:'ymd',unit:'hours',grain:'id',mode:'history',coverageStart:'',coverageEnd:'',asOf:'',categoryMap:{}};
}
export function audit(w:Workspace,action:string) {w.audit=[...w.audit,{at:new Date().toISOString(),action}].slice(-1000);}
export function digest(value:unknown):string {
 const canonical=(v:unknown):unknown=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,x])=>[k,canonical(x)])):v;
 const s=JSON.stringify(canonical(value));let a=2166136261,b=5381;
 for(let i=0;i<s.length;i++){a=Math.imul(a^s.charCodeAt(i),16777619);b=Math.imul(b,33)^s.charCodeAt(i);}
 return (a>>>0).toString(16)+(b>>>0).toString(16);
}

