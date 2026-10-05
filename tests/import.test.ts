import test from 'node:test';
import assert from 'node:assert/strict';
import {sheetToDatasets} from '../src/files';
import {recommendMapping} from '../shared/import';
import {emptyWorkspace} from '../shared/model';
import {aggregate,validate} from '../shared/analytics';
test('wide table unpivots selected measures with stable collision-detecting IDs',()=>{
 const sheet={id:'sheet',fileId:'file',name:'급여',matrix:[['사번','기준월','기본급','식대','총액'],['A','2026-09-01','3000000','200000','3200000']],headerRow:0,selected:true,shape:'columns' as const,idColumn:'사번',dateColumn:'기준월',wideRole:'payroll' as const,valueColumns:['기본급','식대']};
 const ds=sheetToDatasets(sheet);assert.equal(ds.length,2);assert.equal(ds[0].rows[0]['값'],'3000000');
 const w=emptyWorkspace();w.datasets=ds;w.datasets.forEach(d=>d.confirmed=true);w.basisConfirmed=true;
 const r=aggregate(w);assert.equal(r.metrics.find(m=>m.id==='payTrend')?.value,3200000);
 const duplicate=sheetToDatasets({...sheet,id:'again'});duplicate.forEach(d=>d.confirmed=true);w.datasets.push(...duplicate);assert.ok(validate(w).some(i=>i.code==='duplicate'));
});
test('ambiguous column names are not auto-resolved',()=>{assert.equal(recommendMapping(['사번','직원번호']).employeeId,undefined);});
test('empty and invalid period inputs do not crash the results screen',()=>{const w=emptyWorkspace();w.filters.from='';w.filters.to='';assert.equal(aggregate(w).available.people,false);});

