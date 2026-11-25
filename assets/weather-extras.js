import { forecastSpread, miaWardrobe } from './weather-extras-model.js';
import { PROVIDERS } from './insights-model.js';
import { node } from './desk-ui.js';
const svgNode=(tag,attrs={})=>{
  const item=document.createElementNS('http://www.w3.org/2000/svg',tag);
  for(const [name,value] of Object.entries(attrs))item.setAttribute(name,value);
  return item;
};
const dayName=date=>new Intl.DateTimeFormat('en-US',{weekday:'short',timeZone:'America/New_York'}).format(new Date(`${date}T12:00:00-05:00`));
export function renderSpread(container, days) {
  const selected=container.querySelector('[aria-pressed="true"]')?.dataset.spreadDate;
  const rows=forecastSpread(days),values=rows.flatMap(row=>[row.low,row.high,row.blend]).filter(Number.isFinite);
  if(!values.length){container.textContent='Waiting for fresh forecasts to compare.';return;}
  const min=Math.floor(Math.min(...values)/5)*5-2,max=Math.ceil(Math.max(...values)/5)*5+2;
  const x=i=>60+i*128,y=value=>165-(value-min)/(max-min)*140;
  const svg=svgNode('svg',{viewBox:'0 0 900 210',role:'img','aria-label':'Daily high temperatures: shaded model spread, with the blended forecast as a line. Use the day buttons for exact readings.'});
  for(let i=0;i<4;i++){
    const value=min+(max-min)*i/3;
    svg.append(svgNode('line',{x1:40,x2:866,y1:y(value),y2:y(value),stroke:'#ffffff12'}));
    const label=svgNode('text',{x:0,y:y(value)+4,fill:'#9cacbd','font-size':12});label.textContent=`${Math.round(value)}°`;svg.append(label);
  }
  // Each patch needs two adjacent, complete source ranges; gaps stay visible.
  rows.forEach((row,i)=>{
    if(i&&row.low!==null&&rows[i-1].low!==null&&Date.parse(row.date)-Date.parse(rows[i-1].date)===86400000){
      const prev=rows[i-1];
      svg.append(svgNode('path',{d:`M${x(i-1)},${y(prev.high)} L${x(i)},${y(row.high)} L${x(i)},${y(row.low)} L${x(i-1)},${y(prev.low)} Z`,fill:'#8ccff033'}));
    }
    if(row.low!==null)svg.append(svgNode('line',{x1:x(i),x2:x(i),y1:y(row.low),y2:y(row.high),stroke:'#8ccff0','stroke-width':3}));
    if(row.blend!==null){
      const prev=rows[i-1];
      if(prev?.blend!==null&&prev?.blend!==undefined&&Date.parse(row.date)-Date.parse(prev.date)===86400000)svg.append(svgNode('line',{x1:x(i-1),x2:x(i),y1:y(prev.blend),y2:y(row.blend),stroke:'#f0d7ad','stroke-width':2.5}));
      svg.append(svgNode('circle',{cx:x(i),cy:y(row.blend),r:4,fill:'#f0d7ad'}));
    }
    const label=svgNode('text',{x:x(i),y:198,'text-anchor':'middle',fill:'#c9d5e2','font-size':13});label.textContent=dayName(row.date);svg.append(label);
  });
  const scroll=node('div','spread-plot');scroll.append(svg);
  const buttons=node('div','spread-days');buttons.setAttribute('role','group');buttons.setAttribute('aria-label','Inspect forecast spread by day');
  const readout=node('div','spread-readout');readout.setAttribute('role','status');
  function inspect(row){
    buttons.querySelectorAll('button').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.spreadDate===row.date)));
    readout.replaceChildren(node('strong','',`${row.date} · ${row.low===null?'Not enough sources':`${(row.high-row.low).toFixed(1)}°F spread`}`));
    for(const source of row.sources)readout.append(node('span','',`${PROVIDERS[source.provider] || source.provider} ${source.value.toFixed(1)}°`));
  }
  for(const row of rows){const button=node('button','',dayName(row.date));button.type='button';button.dataset.spreadDate=row.date;button.setAttribute('aria-label',`Compare high temperatures for ${row.date}`);button.addEventListener('click',()=>inspect(row));buttons.append(button);}
  inspect(rows.find(row=>row.date===selected)||rows[0]);
  container.replaceChildren(scroll,buttons,readout);
}
export function renderMia(container, day) {
  const mood=miaWardrobe(day),art=svgNode('svg',{viewBox:'0 0 128 150',role:'img','aria-label':`Mia, a light tabby with blue eyes: ${mood.name}`});
  art.classList.add('mia-wardrobe');art.dataset.outfit=mood.outfit;
  art.append(svgNode('ellipse',{cx:64,cy:136,rx:40,ry:7,fill:'#0003'}));
  art.append(svgNode('path',{d:'M37 88 Q26 112 37 136 H91 Q102 112 91 88 Z',fill:'#d9cbb6'}));
  if(mood.outfit==='raincoat'){
    art.append(svgNode('path',{d:'M35 87 Q21 111 34 137 H94 Q107 111 93 87 Z',fill:'#e6b957'}));
    art.append(svgNode('path',{d:'M64 94 V137 M35 116 H51 M77 116 H93',stroke:'#92713d','stroke-width':2}));
  }
  art.append(svgNode('image',{href:'./assets/mia.svg',x:14,y:0,width:100,height:100}));
  if(mood.outfit==='sunglasses'){
    art.append(svgNode('path',{d:'M41 49 H59 V61 Q50 69 41 60 Z M69 49 H87 V60 Q78 69 69 61 Z',fill:'#263441',stroke:'#8ccff0','stroke-width':2}));
    art.append(svgNode('path',{d:'M59 53 Q64 49 69 53',fill:'none',stroke:'#8ccff0','stroke-width':2}));
  }
  if(mood.outfit==='scarf'){
    art.append(svgNode('path',{d:'M34 87 Q64 99 94 87 V101 Q64 113 34 101 Z M72 102 L88 102 84 133 69 131 Z',fill:'#d7b1ed'}));
    art.append(svgNode('path',{d:'M36 94 Q64 106 92 94 M74 119 L86 121',stroke:'#936bae','stroke-width':3,fill:'none'}));
  }
  if(mood.outfit==='bow')art.append(svgNode('path',{d:'M64 101 46 91 V111 Z M64 101 82 91 V111 Z',fill:'#a7d8ad'}));
  const copy=node('div','mia-dispatch');copy.append(node('span','eyebrow','Mia’s daily dispatch'),node('h2','',mood.name),node('p','',mood.line),node('small','smallMuted','A little forecast-inspired fun. Outfit updates with today’s weather.'));
  container.replaceChildren(art,copy);
}
