import type { FishingMode } from './slotGame';
export const FISHING_POSES=['stand','cast','retrieve','sit','twitch','sleep'] as const;
export type FishingPose=typeof FISHING_POSES[number];
export type FishingFrame={pose:FishingPose;action:'rest'|'cast'|'wind'|'watch'|'bite'|'sleep';progress:number};
// A clocked sequence is independent of reel STOP buttons: fast play cannot skip a cast halfway.
export function fishingFrame(mode:FishingMode,elapsed:number,bite=false):FishingFrame {
 const t=((Math.max(0,elapsed)%16000)+16000)%16000;
 if(mode==='float'){
   if(bite||(t>=7000&&t<8600))return {pose:'twitch',action:'bite',progress:(t%1600)/1600};
   if(t>=11500&&t<15000)return {pose:'sleep',action:'sleep',progress:(t-11500)/3500};
   return {pose:'sit',action:'watch',progress:t/16000};
 }
 if(bite)return {pose:'retrieve',action:'wind',progress:(t%1200)/1200};
 if(t>=1400&&t<2600)return {pose:'cast',action:'cast',progress:(t-1400)/1200};
 if(t>=2600&&t<10000)return {pose:'retrieve',action:'wind',progress:(t-2600)/7400};
 return {pose:'stand',action:'rest',progress:t/16000};
}
export function poseSrc(actorId:string,pose:FishingPose){return `/assets/slot/actors/${actorId}/${pose}.webp`;}
// Rod tips measured in each independent source image, before padding/resizing.
const TIPS:Record<FishingPose,readonly (readonly [number,number])[]>={
 stand:[[.963,.36],[.96,.30],[.95,.30],[.93,.326],[.95,.33]],
 cast:[[.96,.11],[.96,.13],[.95,.135],[.97,.105],[.96,.25]],
 retrieve:[[.97,.62],[.96,.62],[.96,.46],[.97,.66],[.96,.59]],
 sit:[[.95,.376],[.95,.32],[.95,.35],[.94,.36],[.95,.38]],
 twitch:[[.934,.109],[.94,.083],[.94,.069],[.94,.083],[.936,.105]],
 sleep:[[.95,.377],[.96,.322],[.955,.346],[.934,.36],[.95,.382]],
};
export function rodTip(actor:number,pose:FishingPose){
 const seated=['sit','twitch','sleep'].includes(pose),size=seated?336:416;
 const [x,y]=TIPS[pose][actor];return {x:(16+x*size)/448,y:(432-size+y*size)/448};
}
export function lurePoint(start:{x:number;y:number},end:{x:number;y:number},progress:number){
 const t=Math.max(0,Math.min(1,progress)),control={x:(start.x+end.x)/2,y:Math.min(start.y,end.y)-70};
 return {x:(1-t)**2*start.x+2*(1-t)*t*control.x+t*t*end.x,y:(1-t)**2*start.y+2*(1-t)*t*control.y+t*t*end.y};
}
