import fs from 'node:fs';
import { accuracyReport } from '../assets/accuracy-model.js';
export function writeAccuracyReport(dataDir='data', generatedAt=new Date().toISOString()) {
  const days=fs.readdirSync(`${dataDir}/scores`).filter(file=>file.endsWith('.json')).map(file=>JSON.parse(fs.readFileSync(`${dataDir}/scores/${file}`,'utf8')));
  const report=accuracyReport(days,generatedAt);
  fs.writeFileSync(`${dataDir}/accuracy_metrics.json`,JSON.stringify(report,null,2)+'\n');
}
