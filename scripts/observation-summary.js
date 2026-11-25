// NWS values carry units: wind is commonly km/h, not metres per second.
export function observationSummary(features, start, end) {
  const temps=[],winds=[],precipHours=new Set();
  let wet=false,n=0;
  for(const feature of features) {
    const p=feature?.properties || {},stamp=Date.parse(p.timestamp);
    if(!Number.isFinite(stamp)||stamp<+start||stamp>=+end)continue;
    n++;
    const temp=p.temperature,wind=p.windSpeed,precip=p.precipitationLastHour;
    if(Number.isFinite(temp?.value)) {
      if(temp.unitCode==='wmoUnit:degC')temps.push(temp.value*9/5+32);
      if(temp.unitCode==='wmoUnit:degF')temps.push(temp.value);
    }
    const factors={'wmoUnit:km_h-1':1/1.609344,'wmoUnit:m_s-1':2.2369362921,'wmoUnit:mi_h-1':1,'wmoUnit:kn':1.150779448};
    if(Number.isFinite(wind?.value)&&wind.value>=0&&Object.hasOwn(factors,wind.unitCode))winds.push(wind.value*factors[wind.unitCode]);
    if(Number.isFinite(precip?.value)&&precip.value>=0&&['wmoUnit:mm','wmoUnit:in','wmoUnit:kg_m-2'].includes(precip.unitCode)) {
      precipHours.add(Math.floor(stamp/3600000));
      if(precip.value>0)wet=true;
    }
  }
  return {obsHighF:temps.length?Math.max(...temps):null,obsLowF:temps.length?Math.min(...temps):null,obsMaxWindMph:winds.length?Math.max(...winds):null,
    precipOccurred:wet?true:precipHours.size>=18?false:null,precipHours:precipHours.size,n};
}
