import { forecastCondition, richmondDay } from './weather-shared.js';
export function forecastSpread(days) {
  return days.slice(0,7).map(day=>{
    const sources=Object.entries(day.blend?.sources || {}).filter(([,source])=>Number.isFinite(source?.highF)).map(([provider,source])=>({provider,value:source.highF}));
    const values=sources.map(source=>source.value);
    return {date:day.date,sources,low:values.length>=2?Math.min(...values):null,high:values.length>=2?Math.max(...values):null,
      blend:Number.isFinite(day.blend?.blendedHighF)?day.blend.blendedHighF:null};
  });
}
const outfits={
  raincoat:{name:'Raincoat duty',lines:['The forecast says showers. My paws have filed an objection.','Raincoat on. Puddle inspection delegated to the humans.','A chance of rain, a certainty of indoor zoomies.']},
  scarf:{name:'Scarf weather',lines:['Today’s forecast: a warm lap with a chance of purring.','Scarf secured. Please preheat my favorite blanket.','Brisk outside. Excellent biscuit-making weather inside.']},
  sunglasses:{name:'Sunbeam supervisor',lines:['Sunglasses on. That sunbeam is officially reserved.','Solar charging in progress. Please do not move the cat.','Clear skies, full snack bowl. A promising forecast.']},
  bow:{name:'Window-seat correspondent',lines:['Cloud watching from the window. Very demanding work.','The sky is doing its thing. I will be doing a nap.','Reporting live from the window: the birds remain suspicious.']},
  waiting:{name:'Forecast on paws',lines:['Waiting for a fresh forecast. In the meantime: a nap.']}
};
export function miaWardrobe(day, now=new Date()) {
  const date=richmondDay(now),kind=forecastCondition(day?.conditions).kind;
  const high=day?.blend?.blendedHighF;
  let outfit='waiting';
  if(day?.date===date && (kind!=='unknown'||Number.isFinite(high))) {
    outfit=['rain','storm'].includes(kind)?'raincoat':kind==='snow'||(Number.isFinite(high)&&high<50)?'scarf':['sun','partly'].includes(kind)?'sunglasses':'bow';
  }
  const choice=outfits[outfit],seed=[...date].reduce((sum,char)=>sum+char.charCodeAt(0),0);
  return {outfit,name:choice.name,line:choice.lines[seed%choice.lines.length]};
}
