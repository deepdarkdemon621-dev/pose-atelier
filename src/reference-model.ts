export type Point = {x:number;y:number;locked:boolean;inferred:boolean};
export const NODE_META = [
  {id:'head',name:'头部中心'}, {id:'neck',name:'颈部'}, {id:'chest',name:'胸腔中心'}, {id:'pelvis',name:'骨盆中心'},
  {id:'leftShoulder',name:'画面左肩'}, {id:'leftElbow',name:'画面左肘'}, {id:'leftWrist',name:'画面左手'},
  {id:'rightShoulder',name:'画面右肩'}, {id:'rightElbow',name:'画面右肘'}, {id:'rightWrist',name:'画面右手'},
  {id:'leftHip',name:'画面左髋'}, {id:'leftKnee',name:'画面左膝'}, {id:'leftAnkle',name:'画面左踝'}, {id:'leftToe',name:'画面左脚尖'},
  {id:'rightHip',name:'画面右髋'}, {id:'rightKnee',name:'画面右膝'}, {id:'rightAnkle',name:'画面右踝'}, {id:'rightToe',name:'画面右脚尖'},
] as const;
export type NodeId = typeof NODE_META[number]['id'];
export type Part = {id:string;name:string;kind:'ellipse'|'limb'|'hand';center?:NodeId;from?:NodeId;to?:NodeId;width:number;height:number;angle:number;depth:number;visible:boolean};
export type ReferenceProject = {version:2;layout:'sample'|'neutral';image:{src:string;name:string;width:number;height:number};points:Record<NodeId,Point>;parts:Part[]};
export type EditMode = 'align'|'pose';
export const CHAINS: [NodeId,NodeId,NodeId][] = [['leftShoulder','leftElbow','leftWrist'],['rightShoulder','rightElbow','rightWrist'],['leftHip','leftKnee','leftAnkle'],['rightHip','rightKnee','rightAnkle']];
export const LINKS: [NodeId,NodeId][] = [['pelvis','chest'],['chest','neck'],['neck','head'],['chest','leftShoulder'],['chest','rightShoulder'],['pelvis','leftHip'],['pelvis','rightHip'],...CHAINS.flatMap(([a,b,c]):[NodeId,NodeId][]=>[[a,b],[b,c]]),['leftAnkle','leftToe'],['rightAnkle','rightToe']];
const distance=(a:{x:number;y:number},b:{x:number;y:number})=>Math.hypot(b.x-a.x,b.y-a.y);
export function solveTwoBone(root:{x:number;y:number},target:{x:number;y:number},l1:number,l2:number,hint:{x:number;y:number},fixedEnd=false) {
  l1=Math.max(.001,l1);l2=Math.max(.001,l2);
  const raw=distance(root,target);let dx=target.x-root.x,dy=target.y-root.y;
  if(raw<.00001){dx=hint.x-root.x;dy=hint.y-root.y;if(Math.hypot(dx,dy)<.00001){dx=1;dy=0;}}
  const n=Math.hypot(dx,dy),ux=dx/n,uy=dy/n;
  const d=fixedEnd?Math.max(.00001,raw):Math.max(Math.abs(l1-l2)+.00001,Math.min(l1+l2-.00001,raw));
  let along=(l1*l1-l2*l2+d*d)/(2*d);if(fixedEnd)along=Math.max(0,Math.min(d,along));
  const side=ux*(hint.y-root.y)-uy*(hint.x-root.x)>=0?1:-1;
  const height=Math.sqrt(Math.max(0,l1*l1-along*along));
  return {middle:{x:root.x+ux*along-uy*height*side,y:root.y+uy*along+ux*height*side},end:fixedEnd?{x:target.x,y:target.y}:{x:root.x+ux*d,y:root.y+uy*d}};
}
export function movePoint(project:ReferenceProject,id:NodeId,target:{x:number;y:number},mode:EditMode):ReferenceProject {
  if(project.points[id].locked||!Number.isFinite(target.x)||!Number.isFinite(target.y))return project;
  const points=Object.fromEntries(Object.entries(project.points).map(([key,p])=>[key,{...p}])) as Record<NodeId,Point>;
  const update=(key:NodeId,p:{x:number;y:number})=>{if(!points[key].locked){points[key].x=p.x;points[key].y=p.y;}};
  const translate=(key:NodeId,dx:number,dy:number)=>{if(points[key].locked)return;points[key].x+=dx;points[key].y+=dy;for(const [a,b]of LINKS)if(a===key)translate(b,dx,dy);};
  if(mode==='align'){update(id,target);return {...project,points};}
  const endChain=CHAINS.find(c=>c[2]===id);
  const midChain=CHAINS.find(c=>c[1]===id);
  if(endChain){
    const [a,b,c]=endChain,old=project.points;
    if(points[b].locked){const v={x:target.x-points[b].x,y:target.y-points[b].y};const n=Math.hypot(v.x,v.y)||1;const r=distance(old[b],old[c]);update(c,{x:points[b].x+v.x/n*r,y:points[b].y+v.y/n*r});}
    else{const solved=solveTwoBone(points[a],target,distance(old[a],old[b]),distance(old[b],old[c]),old[b]);update(b,solved.middle);update(c,solved.end);}
    const dx=points[c].x-old[c].x,dy=points[c].y-old[c].y;for(const [a2,b2]of LINKS)if(a2===c)translate(b2,dx,dy);
  }else if(midChain){
    const [a,b,c]=midChain,old=project.points;
    if(points[c].locked){const solved=solveTwoBone(points[a],points[c],distance(old[a],old[b]),distance(old[b],old[c]),target,true);update(b,solved.middle);}
    else{const dx=target.x-points[a].x,dy=target.y-points[a].y,n=Math.hypot(dx,dy)||1,r=distance(old[a],old[b]);const p={x:points[a].x+dx/n*r,y:points[a].y+dy/n*r};translate(b,p.x-points[b].x,p.y-points[b].y);}
  }else{
    const dx=target.x-points[id].x,dy=target.y-points[id].y;translate(id,dx,dy);
    for(const [a,b,c]of CHAINS){if(!points[c].locked||points[b].locked)continue;const old=project.points;const solved=solveTwoBone(points[a],points[c],distance(old[a],old[b]),distance(old[b],old[c]),old[b],true);update(b,solved.middle);}
  }
  return {...project,points};
}
export function createReference(width=753,height=1103,src='/example-reference.jpg',name='你的示例参考图',sample=true):ReferenceProject {
  const generic:Record<NodeId,[number,number]>={head:[.5,.14],neck:[.5,.23],chest:[.5,.33],pelvis:[.5,.49],leftShoulder:[.35,.27],leftElbow:[.28,.41],leftWrist:[.23,.55],rightShoulder:[.65,.27],rightElbow:[.72,.41],rightWrist:[.77,.55],leftHip:[.43,.5],leftKnee:[.4,.69],leftAnkle:[.39,.88],leftToe:[.35,.93],rightHip:[.57,.5],rightKnee:[.6,.69],rightAnkle:[.61,.88],rightToe:[.66,.93]};
  const example:Record<NodeId,[number,number]>={head:[.70,.115],neck:[.67,.285],chest:[.535,.365],pelvis:[.285,.418],leftShoulder:[.16,.085],leftElbow:[-.055,.035],leftWrist:[.08,.196],rightShoulder:[.955,.265],rightElbow:[1.12,.30],rightWrist:[1.1,.46],leftHip:[.205,.425],leftKnee:[.258,.635],leftAnkle:[.321,.837],leftToe:[.365,.984],rightHip:[.463,.474],rightKnee:[.505,.607],rightAnkle:[.465,.812],rightToe:[.491,.965]};
  const source=sample?example:generic;const inferred:NodeId[]=sample?['pelvis','leftHip','rightHip','leftShoulder','leftElbow','rightShoulder','rightElbow','rightWrist']:[];
  const points=Object.fromEntries(NODE_META.map(({id})=>[id,{x:source[id][0]*width,y:source[id][1]*height,locked:false,inferred:inferred.includes(id)}])) as Record<NodeId,Point>;
  const parts:Part[]=[
    {id:'head',name:'头部',kind:'ellipse',center:'head',width:sample?.48:.2,height:sample?.35:.145,angle:sample?14:0,depth:70,visible:true},
    {id:'chest',name:'胸腔',kind:'ellipse',center:'chest',width:sample?.62:.32,height:sample?.25:.19,angle:sample?9:0,depth:60,visible:true},
    {id:'pelvis',name:'骨盆',kind:'ellipse',center:'pelvis',width:sample?.34:.28,height:sample?.17:.13,angle:sample?-12:0,depth:35,visible:true},
  ];
  for(const side of ['left','right'] as const){const label=side==='left'?'画面左':'画面右';
    for(const [suffix,title,from,to,w,z]of [['UpperArm','上臂','Shoulder','Elbow',.10,40],['Forearm','前臂','Elbow','Wrist',.075,45],['Thigh','大腿','Hip','Knee',sample?.19:.12,15],['Calf','小腿','Knee','Ankle',sample?.13:.09,20],['Foot','脚','Ankle','Toe',sample?.13:.10,25]] as const){parts.push({id:`${side}${suffix}`,name:`${label}${title}`,kind:'limb',from:`${side}${from}` as NodeId,to:`${side}${to}` as NodeId,width:w,height:0,angle:0,depth:z,visible:!(sample&&['UpperArm','Forearm'].includes(suffix))});}
    parts.push({id:`${side}Hand`,name:`${label}手`,kind:'hand',center:`${side}Wrist`,width:.065,height:.06,angle:0,depth:55,visible:!sample||side==='left'});
  }
  return {version:2,layout:sample?'sample':'neutral',image:{src,name,width,height},points,parts};
}
export function validateReference(value:unknown):ReferenceProject {
  const d=value as ReferenceProject;
  if(!d||d.version!==2||!['sample','neutral'].includes(d.layout)||!d.image||!Number.isFinite(d.image.width)||!Number.isFinite(d.image.height)||d.image.width<1||d.image.height<1||d.image.width>20000||d.image.height>20000)throw Error('这不是有效的参考图项目');
  if(typeof d.image.src!=='string'||(!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(d.image.src)&&d.image.src!=='/example-reference.jpg'))throw Error('项目图片格式不支持');
  if(typeof d.image.name!=='string'||!d.points||!Array.isArray(d.parts)||d.parts.length!==15)throw Error('项目数据不完整');
  for(const {id}of NODE_META){const p=d.points[id];if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)||Math.abs(p.x)>d.image.width*10||Math.abs(p.y)>d.image.height*10||typeof p.locked!=='boolean'||typeof p.inferred!=='boolean')throw Error('关键点数据不正确');}
  const expected=createReference().parts;
  for(const [i,p]of d.parts.entries()){const e=expected[i];if(p.id!==e.id||p.kind!==e.kind||p.center!==e.center||p.from!==e.from||p.to!==e.to||typeof p.visible!=='boolean'||typeof p.name!=='string'||![p.width,p.height,p.angle,p.depth].every(Number.isFinite)||p.width<.005||p.width>2||p.height<0||p.height>2||Math.abs(p.angle)>360||p.depth<0||p.depth>100)throw Error('体块数据不正确');}
  return structuredClone(d);
}
