import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {normalizeDwdIcon,fetchDwdIcon} from '../scripts/dwd-icon.js';
import {blendHourly,blendDaily,blendDailyConditions,saveForecastSnapshot} from '../scripts/update.js';
import {chartDataset} from '../assets/insights-model.js';
const seconds=value=>Date.parse(value)/1000;
const now=new Date('2026-11-16T12:30:00Z');
function payload(){return {
 daily_units:{temperature_2m_max:'°F',wind_speed_10m_max:'mp/h'},hourly_units:{temperature_2m:'°F',wind_speed_10m:'mp/h'},
 daily:{time:[seconds('2026-11-16T05:00:00Z'),seconds('2026-11-17T05:00:00Z')],temperature_2m_max:[70,null],temperature_2m_min:[40,0],weather_code:[61,null],wind_speed_10m_max:[10,0],precipitation_sum:[2,null]},
 hourly:{time:[seconds('2026-11-16T12:00:00Z'),seconds('2026-11-16T13:00:00Z'),seconds('2026-11-16T14:00:00Z')],temperature_2m:[40,50,null],wind_speed_10m:[10,0,null]}
};}
test('ICON preserves units, dates, true zeros and missing values without inventing rain probabilities',()=>{
 const result=normalizeDwdIcon(payload(),{now});
 assert.deepEqual(result.temps,[{date:'2026-11-16',highF:70,lowF:40},{date:'2026-11-17',highF:null,lowF:0}]);
 assert.equal(result.conditions[0].rain,true);assert.equal(result.conditions[0].precipExpected,true);
 assert.equal(result.conditions[1].rain,null);assert.equal(result.conditions[1].precipExpected,null);
 assert.equal(result.hours.length,2);assert.equal(result.hours[0].timeISO,'2026-11-16T08:00:00.000-05:00');
 assert.equal(result.hours[0].windMph,0);assert.equal(result.hours[1].tempF,null);
 assert.ok(result.hours.every(row=>row.precipProbability===null));assert.ok(result.conditions.every(row=>row.precipProbability===null));
 const invalid=payload();invalid.hourly_units.wind_speed_10m='km/h';assert.throws(()=>normalizeDwdIcon(invalid),/unexpected units/);
});
test('ICON epoch timestamps keep both repeated hours at the Eastern daylight-saving boundary',()=>{
 const data=payload();data.hourly.time=[seconds('2026-11-01T05:00:00Z'),seconds('2026-11-01T06:00:00Z')];data.hourly.temperature_2m=[50,51];
 const {hours}=normalizeDwdIcon(data,{now:new Date('2026-11-01T04:00:00Z')});
 assert.match(hours[0].timeISO,/01:00:00.000-04:00/);assert.match(hours[1].timeISO,/01:00:00.000-05:00/);
 assert.equal(Date.parse(hours[1].timeISO)-Date.parse(hours[0].timeISO),3600000);
});
test('the source uses one keyless DWD endpoint with explicit units and rejects failed or empty responses',async()=>{
 let calls=0;const fetcher=async(url,options)=>{calls++;assert.equal(url.hostname,'api.open-meteo.com');assert.equal(url.pathname,'/v1/dwd-icon');assert.equal(url.searchParams.get('temperature_unit'),'fahrenheit');assert.equal(url.searchParams.get('wind_speed_unit'),'mph');assert.equal(url.searchParams.get('timeformat'),'unixtime');assert.equal(url.searchParams.has('apikey'),false);assert.ok(options.signal);return {ok:true,json:async()=>payload()};};
 const data=await fetchDwdIcon({lat:37.5407,lon:-77.4360,now,fetcher});assert.equal(calls,1);assert.equal(data.temps.length,2);
 await assert.rejects(fetchDwdIcon({fetcher:async()=>({ok:false,status:429})}),/429/);
 const empty=payload();empty.daily.temperature_2m_max=[null,null];empty.daily.temperature_2m_min=[null,null];assert.throws(()=>normalizeDwdIcon(empty),/no daily temperatures/);
});
test('four-source blends include ICON temperature and wind without diluting the available rain chances',()=>{
 const timeISO='2026-11-16T08:00:00.000-05:00';
 const rows=[70,72,74,76].map((tempF,i)=>[{timeISO,tempF,windMph:(i+1)*10,precipProbability:[50,70,null,null][i]}]);
 const [hour]=blendHourly(...rows);assert.equal(hour.blendedTempF,73);assert.equal(hour.blendedWindMph,25);assert.equal(hour.blendedPrecipProbability,60);assert.equal(hour.sources.dwdIcon.tempF,76);
 const date='2026-11-16',temps=[70,72,74,76].map(highF=>[{date,highF,lowF:highF-20}]);
 const conditions=[0,1,2,3].map(i=>[{date,windMph:(i+1)*10,precipProbability:[50,70,null,null][i],rain:[true,false,true,true][i]}]);
 const [day]=blendDaily(...temps.slice(0,3),...conditions.slice(0,3),temps[3],conditions[3]);
 assert.equal(day.blendedHighF,73);assert.equal(day.blendedLowF,53);assert.equal(day.blendedWindMph,25);assert.equal(day.blendedPrecipProbability,60);
 const [without]=blendDaily(...temps.slice(0,3),...conditions.slice(0,3));assert.equal(without.blendedHighF,72);assert.equal(without.sources.dwdIcon.highF,null);
 assert.equal(blendDailyConditions(...conditions)[0].consensus.rainSignal,'strong');
 assert.equal(blendDailyConditions(...conditions.slice(0,3))[0].consensus.rainSignal,'medium');
});
test('adding a source never rewrites an already-issued forecast snapshot or invents earlier accuracy points',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'miateo-history-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const file=path.join(dir,'existing.json'),original='{"issuedAt":"earlier","forecasts":{"nws":{"highF":70}}}\n';fs.writeFileSync(file,original);
 assert.equal(saveForecastSnapshot(file,{forecasts:{dwdIcon:{highF:75}}}),false);assert.equal(fs.readFileSync(file,'utf8'),original);
 const next=path.join(dir,'next.json');assert.equal(saveForecastSnapshot(next,{forecasts:{dwdIcon:{highF:75}}}),true);
 const chart=chartDataset({series:{nws:[{date:'2026-11-16',value:2}],dwdIcon:[{date:'2026-11-19',value:1}]}},'all');
 assert.deepEqual(chart.series.dwdIcon,[{date:'2026-11-19',value:1}]);assert.deepEqual(chart.dates,['2026-11-16','2026-11-19']);
});
