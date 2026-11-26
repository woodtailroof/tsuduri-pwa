// Re-encode the existing official app icons for repeated reel rendering.
// No generated characters or changes to the original artwork.
import fs from 'node:fs/promises';
import sharp from 'sharp';
await fs.mkdir('public/assets/slot',{recursive:true});
for(const id of ['tsuduri','matsuri','kokoro','lulu','rin']) {
 const info=await sharp(`public/assets/character-icons/${id}.png`).resize(256,256,{fit:'inside',withoutEnlargement:true}).webp({quality:82}).toFile(`public/assets/slot/${id}-icon.webp`);
 console.log(`${id}: ${info.size} bytes`);
}
