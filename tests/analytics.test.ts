import test from 'node:test';
import assert from 'node:assert/strict';
import {sampleWorkspace} from '../shared/sample';
import {aggregate,validate,draft} from '../shared/analytics';
import {parseDate,numeric} from '../shared/import';
import {emptyWorkspace,newDataset} from '../shared/model';
test('sample is calculated from three real datasets without join multiplication',()=>{
 const w=sampleWorkspace(),r=aggregate(w);
 assert.deepEqual(validate(w),[]);assert.equal(r.available.people,true);
 const expected=w.datasets[2].rows.filter(x=>x['기준일']>='2026-07-01').reduce((sum,x)=>sum+Number(x['값']),0);
 assert.equal(r.metrics.find(x=>x.id==='payTrend')?.value,expected);
 assert.ok(draft(r).includes(expected.toLocaleString('ko-KR')));
});
test('end date inclusion changes headcount only by explicit basis',()=>{
 const w=sampleWorkspace();w.datasets=[w.datasets[0]];w.datasets[0].rows=[{'사번':'A','입사일':'2026-01-01','퇴사일':'2026-09-30','부서':'HR','고용형태':'정규직'}];
 assert.equal(aggregate(w).metrics[0].value,1);w.exitInclusive=false;assert.equal(aggregate(w).metrics[0].value,0);
});
test('missing payroll does not become zero',()=>{const w=sampleWorkspace();w.datasets=[w.datasets[0]];const r=aggregate(w);assert.equal(r.available.payroll,false);assert.equal(r.reasons.payroll,'자료 없음');assert.ok(!r.metrics.some(m=>m.id==='payTrend'));});
test('rehire without overlap allowed, overlap blocks',()=>{
 const w=sampleWorkspace();w.datasets=[w.datasets[0]];w.datasets[0].rows=[
 {'사번':'A','입사일':'2026-01-01','퇴사일':'2026-08-01','부서':'HR'},
 {'사번':'A','입사일':'2026-09-01','퇴사일':'','부서':'HR'}];
 assert.deepEqual(validate(w),[]);assert.equal(aggregate(w).metrics[0].value,1);
 w.datasets[0].rows[1]['입사일']='2026-07-01';assert.ok(validate(w).some(i=>i.code==='overlap'));assert.equal(aggregate(w).metrics[0].value,null);
});
test('current roster never invents past history',()=>{const w=sampleWorkspace();w.datasets=[w.datasets[0]];w.datasets[0].mode='current';assert.equal(aggregate(w).metrics[1].value,null);assert.equal(aggregate(w).metrics[3].value,null);});
test('cross sheet duplicate record IDs block amounts',()=>{const w=sampleWorkspace();const d=structuredClone(w.datasets[2]);d.id='second';w.datasets.push(d);assert.equal(aggregate(w).available.payroll,false);assert.ok(validate(w).some(i=>i.code==='duplicate'));});
test('failed employee join is visible, not silently dropped',()=>{const w=sampleWorkspace();w.datasets[2].rows[0]['사번']='UNKNOWN';assert.ok(validate(w).some(i=>i.code==='join'));assert.equal(aggregate(w).available.payroll,false);});
test('explicit source deferral is reflected in notices',()=>{const w=sampleWorkspace();w.datasets[2].excluded=true;const r=aggregate(w);assert.equal(r.available.payroll,false);assert.ok(r.notices.some(n=>n.includes('보류')));});
test('dates and money parsing reject ambiguity',()=>{assert.equal(parseDate('2026-02-30','ymd'),null);assert.equal(parseDate('02/03/2026','ymd'),null);assert.equal(parseDate('02/03/2026','dmy'),'2026-03-02');assert.equal(numeric('1,000'),1000);assert.equal(numeric('1,00'),null);assert.equal(numeric(''),null);});
test('empty uploaded period remains null for payments',()=>{const w=sampleWorkspace();w.filters.from='2026-10';w.filters.to='2026-10';assert.equal(aggregate(w).metrics.find(m=>m.id==='payTrend')?.value,null);});
test('hour and day leave are not converted',()=>{const w=sampleWorkspace();w.datasets=[w.datasets[1]];w.datasets[0].rows=w.datasets[0].rows.filter(r=>r['항목']==='휴가');w.datasets[0].unit='days';const r=aggregate(w);assert.equal(r.metrics.find(m=>m.id==='leaveHours')?.value,null);assert.ok(r.metrics.find(m=>m.id==='leaveDays')!.value!>0);});
test('filter updates report and charts from same aggregate',()=>{const w=sampleWorkspace();const all=aggregate(w);w.filters.department='경영지원';const r=aggregate(w);assert.notEqual(r.key,all.key);assert.ok(r.metrics[0].value!<all.metrics[0].value!);assert.equal(r.charts.find(c=>c.id==='department')?.points.length,1);});

