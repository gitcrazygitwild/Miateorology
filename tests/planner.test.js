import test from 'node:test';
import assert from 'node:assert/strict';
import {upcomingHours,bestOutdoorWindow} from '../assets/planner-model.js';
import {forecastCondition,richmondDay,weatherIcon} from '../assets/weather-shared.js';
const now=new Date('2026-11-15T14:30:00Z');
const hour=(time,temp=68,rain=10,wind=5)=>({timeISO:`2026-11-15T${time}:00:00Z`,blendedTempF:temp,blendedPrecipProbability:rain,blendedWindMph:wind});
const feed=hours=>({generatedAt:now.toISOString(),hours});
test('quiet summaries preserve cloudy source conditions; partial sunshine precedes clouds',()=>{
 assert.equal(forecastCondition({consensus:{summary:'Mostly quiet signal'},sources:{nws:{summary:'Mostly Cloudy'},met:{summary:'Overcast'}}}).kind,'cloud');
 assert.equal(forecastCondition({sources:{nws:{summary:'Partly cloudy'}}}).kind,'partly');
 assert.equal(forecastCondition({}).kind,'unknown');
 assert.match(weatherIcon('cloud'),/data-weather-kind="cloud"/);
 assert.equal(richmondDay(new Date('2026-11-16T03:00Z')),'2026-11-15');
});
test('hourly strip excludes elapsed hours and expired feeds, sorts and deduplicates',()=>{
 assert.deepEqual(upcomingHours(feed([hour('15'),hour('13'),hour('14'),hour('15')]),now).map(h=>h.timeISO),[hour('14').timeISO,hour('15').timeISO]);
 assert.equal(upcomingHours({generatedAt:'2026-11-10T00:00Z',hours:[hour('15')]},now).length,0);
 assert.equal(upcomingHours({generatedAt:'2026-11-16T00:00Z',hours:[hour('15')]},now).length,0);
});
test('outdoor windows require contiguous complete future hours and activity-specific weather',()=>{
 const data=feed([hour('14'),hour('15'),hour('16'),hour('18',90),hour('19',90)]);
 assert.equal(bestOutdoorWindow(data,{},'walk',now).start.toISOString(),hour('15').timeISO.replace('Z','.000Z'));
 assert.equal(bestOutdoorWindow(feed([hour('15'),hour('17')]),{},'walk',now),null);
 assert.equal(bestOutdoorWindow(feed([hour('15',null),hour('16')]),{},'walk',now),null);
 assert.equal(bestOutdoorWindow(feed([hour('15',68,40),hour('16',68,40)]),{},'patio',now),null);
 assert.ok(bestOutdoorWindow(feed([hour('15',68,40)]),{},'errands',now));
 const storm={days:[{date:'2026-11-15',consensus:{thunderSignal:'strong'}}]};
 assert.equal(bestOutdoorWindow(data,storm,'walk',now),null);
});
