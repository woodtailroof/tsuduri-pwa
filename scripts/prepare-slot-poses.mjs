import fs from 'node:fs/promises';import sharp from 'sharp';
const sources=JSON.parse(await fs.readFile(process.argv[2]??'.slot-pose-sources.json','utf8'));
for(const item of sources){
 const target=`public/assets/slot/actors/${item.actor}/${item.pose}.webp`;
 try{if((await fs.stat(target)).mtimeMs>=(await fs.stat(item.source)).mtimeMs)continue;}catch{}
 const seated=['sit','twitch','sleep'].includes(item.pose),size=seated?336:416;
 const left=16,top=432-size;
 const dir=`public/assets/slot/actors/${item.actor}`;await fs.mkdir(dir,{recursive:true});
 await sharp(item.source).resize(size,size,{fit:'contain',background:{r:0,g:0,b:0,alpha:0}}).extend({top,bottom:16,left,right:448-size-left,background:{r:0,g:0,b:0,alpha:0}}).webp({quality:82,alphaQuality:100,effort:6}).toFile(`${dir}/${item.pose}.webp`);
}
console.log(`Prepared ${sources.length} standalone poses at 448×448; common foot baseline, smaller seated bodies, alpha preserved`);
