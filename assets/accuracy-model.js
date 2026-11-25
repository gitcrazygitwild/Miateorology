import { PROVIDERS } from './insights-model.js';
const valid = value => Number.isFinite(value) && value >= 0;
const mean = values => values.length ? values.reduce((sum,value)=>sum+value,0)/values.length : null;
export function metricValues(score, day = {}) {
  const errors = score?.errors || {};
  return {
    temperature: valid(errors.highAbsF) && valid(errors.lowAbsF) ? (errors.highAbsF+errors.lowAbsF)/2 : null,
    // Legacy observations did not retain verified wind units or precipitation coverage.
    wind: day.observationVersion >= 2 && valid(errors.windAbsMph) ? errors.windAbsMph : null,
    rain: day.observationVersion >= 2 && typeof day.observed?.precipOccurred === 'boolean' && typeof score?.predicted?.precipExpected === 'boolean'
      ? Number(day.observed.precipOccurred === score.predicted.precipExpected)*100 : null
  };
}
export function accuracyReport(days, generatedAt = new Date().toISOString()) {
  const sorted = [...new Map(days.filter(day=>/^\d{4}-\d{2}-\d{2}$/.test(day.targetDate) && Number.isFinite(Date.parse(day.targetDate))).map(day=>[day.targetDate,day])).values()].sort((a,b)=>a.targetDate.localeCompare(b.targetDate));
  const series = Object.fromEntries(['temperature','wind','rain'].map(metric=>[metric,Object.fromEntries(Object.keys(PROVIDERS).map(provider=>[provider,[]]))]));
  for(const day of sorted) for(const score of day.scores || []) {
    if(!Object.hasOwn(PROVIDERS,score.provider))continue;
    for(const [metric,value] of Object.entries(metricValues(score,day))) {
      if(value!==null)series[metric][score.provider].push({date:day.targetDate,value});
    }
  }
  const latestDate=sorted.at(-1)?.targetDate || null;
  const start=latestDate ? Date.parse(latestDate)-29*86400000 : Infinity;
  const leaderboard=Object.keys(PROVIDERS).map(provider=>{
    const metrics=Object.fromEntries(Object.entries(series).map(([key,sources])=>{
      const points=sources[provider].filter(point=>Date.parse(point.date)>=start);
      return [key,{value:mean(points.map(point=>point.value)),days:points.length}];
    }));
    return {provider,...metrics};
  });
  return {version:1,generatedAt,latestDate,windowDays:30,series,leaderboard};
}
