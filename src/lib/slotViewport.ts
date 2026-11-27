export function fitCabinet(width:number,height:number,nativeWidth:number,nativeHeight:number):number {
 if(![width,height,nativeWidth,nativeHeight].every(n=>Number.isFinite(n)&&n>0))return 1;
 return Math.max(.1,Math.min(1,width/nativeWidth,height/nativeHeight));
}
