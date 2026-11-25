import test from 'node:test';
import assert from 'node:assert/strict';
import {metricValues,accuracyReport} from '../assets/accuracy-model.js';
import {observationSummary} from '../scripts/observation-summary.js';
import {forecastSpread,miaWardrobe} from '../assets/weather-extras-model.js';

test('temperature scores exclude wind and legacy wind/rain remain unverified',()=>{
  const score={errors:{highAbsF:4,lowAbsF:2,windAbsMph:90,overallAbsF:32},predicted:{precipExpected:true}};
  assert.deepEqual(metricValues(score),{temperature:3,wind:null,rain:null});
  assert.deepEqual(metricValues(score,{observationVersion:2,precipitationForecastVersion:2,observed:{precipOccurred:true}}),{temperature:3,wind:90,rain:100});
  assert.equal(metricValues({errors:{highAbsF:0,lowAbsF:null}}).temperature,null);
  assert.equal(metricValues({errors:{highAbsF:0,lowAbsF:0}}).temperature,0);
});
test('separate scorecards use calendar windows, explicit sample sizes, and no fabricated source history',()=>{
  const row=(targetDate,highAbsF)=>({targetDate,scores:[{provider:'nws',errors:{highAbsF,lowAbsF:highAbsF}}]});
  const days=[row('2026-10-01',100),row('2026-11-15',2),row('2026-11-16',4)],before=JSON.stringify(days);
  const report=accuracyReport(days);
  assert.equal(report.leaderboard[0].temperature.value,3);assert.equal(report.leaderboard[0].temperature.days,2);
  assert.equal(report.leaderboard[0].wind.value,null);assert.equal(report.series.temperature.dwdIcon.length,0);
  assert.equal(JSON.stringify(days),before);
});
test('NWS observation units are honored and missing rain measurements never count as dry',()=>{
  const start=Date.parse('2026-11-01T04:00:00Z'),end=start+25*3600000;
  const feature=(hour,wind,unit='wmoUnit:km_h-1',rain=null)=>({properties:{timestamp:new Date(start+hour*3600000).toISOString(),temperature:{value:0,unitCode:'wmoUnit:degC'},windSpeed:{value:wind,unitCode:unit},precipitationLastHour:{value:rain,unitCode:'wmoUnit:mm'}}});
  let result=observationSummary([feature(0,16.09344),feature(1,999,'unknown')],start,end);
  assert.equal(result.obsMaxWindMph,10);assert.equal(result.obsHighF,32);assert.equal(result.precipOccurred,null);
  result=observationSummary([feature(0,10,'wmoUnit:m_s-1',1)],start,end);
  assert.ok(Math.abs(result.obsMaxWindMph-22.36936)<.001);assert.equal(result.precipOccurred,true);
  assert.equal(observationSummary(Array.from({length:18},(_,i)=>feature(i,0,undefined,0)),start,end).precipOccurred,false);
  assert.equal(observationSummary(Array.from({length:18},()=>feature(0,0,undefined,0)),start,end).precipOccurred,null);
  assert.equal(observationSummary([feature(-1,100),feature(25,100)],start,end).obsMaxWindMph,null);
});
test('spread excludes missing readings and does not imply agreement with only one source',()=>{
  const rows=forecastSpread([{date:'2026-11-17',blend:{blendedHighF:5,sources:{nws:{highF:0},openMeteo:{highF:10},metNo:{highF:null}}}},{date:'2026-11-18',blend:{sources:{nws:{highF:65}}}}]);
  assert.equal(rows[0].low,0);assert.equal(rows[0].high,10);assert.equal(rows[0].sources.length,2);
  assert.equal(rows[1].low,null);assert.equal(rows[1].high,null);
});
test('Mia uses Richmond today, weather priorities, stable daily lines, and a missing-data outfit',()=>{
  const now=new Date('2026-11-18T01:00:00Z');
  const day=(kind,high)=>({date:'2026-11-17',blend:{blendedHighF:high},conditions:{sources:{nws:{summary:kind}}}});
  assert.equal(miaWardrobe(day('Rain',35),now).outfit,'raincoat');
  assert.equal(miaWardrobe(day('Snow',35),now).outfit,'scarf');
  assert.equal(miaWardrobe(day('Clear',70),now).outfit,'sunglasses');
  assert.equal(miaWardrobe(day('Cloudy',60),now).outfit,'bow');
  assert.deepEqual(miaWardrobe(day('Clear',70),now),miaWardrobe(day('Clear',70),now));
  assert.equal(miaWardrobe(undefined,now).outfit,'waiting');
  assert.equal(miaWardrobe({...day('Clear',70),date:'2026-11-16'},now).outfit,'waiting');
});
