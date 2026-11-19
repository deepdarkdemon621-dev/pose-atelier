import {useEffect,useRef,useState} from 'react';
import type {PointerEvent as ReactPointerEvent} from 'react';
import {Download,Upload,Save,Undo2,Redo2,ImagePlus,LockKeyhole,UnlockKeyhole,Eye,EyeOff,ZoomIn,ZoomOut,Maximize,Move,Check,RotateCcw,FlipHorizontal2,Layers,ScanLine,Hand,ChevronDown} from 'lucide-react';
import {createReference,validateReference,movePoint,NODE_META,LINKS,type ReferenceProject,type NodeId,type EditMode,type Part} from './reference-model';
import {readReference,storeReference,asDataURL,portableReference} from './reference-storage';
import './reference.css';

function Body({project,prefix,outline=false}:{project:ReferenceProject;prefix:string;outline?:boolean}){
  const {width:w,height:h}=project.image;const p=project.points;
  return <g className="body-volumes"><defs><linearGradient id={`${prefix}-body`} x1="0" y1="0" x2="1" y2=".35"><stop stopColor="#e7eff1"/><stop offset=".42" stopColor="#b7cbd0"/><stop offset="1" stopColor="#718b95"/></linearGradient><linearGradient id={`${prefix}-joint`}><stop stopColor="#788f99"/><stop offset="1" stopColor="#3d5662"/></linearGradient></defs>
    {[...project.parts].sort((a,b)=>a.depth-b.depth).filter(part=>part.visible).map(part=>{
      const fill=outline?'#92e4cd':`url(#${prefix}-body)`,stroke=outline?'#216c5a':'#405761',sw=w*.0022;
      if(part.kind==='limb'){
        const a=p[part.from!],b=p[part.to!],length=Math.hypot(b.x-a.x,b.y-a.y),angle=Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI;const r=part.width*w/2,r2=r*(part.id.includes('Foot')?.9:.72);
        return <g key={part.id} data-part={part.id} transform={`translate(${a.x} ${a.y}) rotate(${angle})`} stroke={stroke} strokeWidth={sw} fill={fill}><path d={`M 0 ${-r} C ${length*.35} ${-r} ${length*.65} ${-r2} ${length} ${-r2} Q ${length+r2*.32} 0 ${length} ${r2} C ${length*.65} ${r2} ${length*.35} ${r} 0 ${r} Q ${-r*.32} 0 0 ${-r} Z`}/><ellipse cx="0" cy="0" rx={r*.35} ry={r} fill={`url(#${prefix}-joint)`}/><ellipse cx={length} cy="0" rx={r2*.25} ry={r2} fill="none" opacity=".6"/><path d={`M ${length*.13} ${-r*.6} L ${length*.85} ${-r2*.6}`} stroke="#f1f7f6" opacity=".45"/></g>;
      }
      const c=p[part.center!],rx=part.width*w/2,ry=part.height*h/2;
      return <g key={part.id} data-part={part.id} transform={`translate(${c.x} ${c.y}) rotate(${part.angle})`} stroke={stroke} strokeWidth={sw} fill={fill}>
        <ellipse rx={rx} ry={ry}/>
        {part.id==='head'?<><path d={`M 0 ${-ry} Q ${rx*.3} 0 0 ${ry}`} fill="none" opacity=".65"/><path d={`M ${-rx*.96} ${ry*.05} Q 0 ${ry*.3} ${rx*.96} ${ry*.05}`} fill="none" opacity=".65"/><path d={`M 0 ${ry*.12} l ${rx*.09} ${ry*.19} l ${-rx*.12} 0`} fill="none"/></>:part.kind==='ellipse'?<><ellipse rx={rx*.94} ry={ry*.20} fill="none" opacity=".45"/><path d={`M 0 ${-ry} Q ${rx*.12} 0 0 ${ry}`} fill="none" opacity=".55"/></>:null}
      </g>;
    })}
  </g>;
}

const download=(url:string,name:string)=>{const a=document.createElement('a');a.href=url;a.download=name;a.click();};
const nextFrames=()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
type Drag={id:NodeId;before:ReferenceProject;offset:{x:number;y:number};moved:boolean}|{pan:true;x:number;y:number;view:{zoom:number;x:number;y:number}};
export function ReferenceApp(){
  const [project,setProject]=useState<ReferenceProject>(()=>createReference());const projectRef=useRef(project);projectRef.current=project;
  const [ready,setReady]=useState(false),[saveStatus,setSaveStatus]=useState('准备本地项目…'),[selected,setSelected]=useState<NodeId>('head'),[partId,setPartId]=useState('head'),[mode,setMode]=useState<EditMode>('align');
  const [imageOpacity,setImageOpacity]=useState(.75),[bodyOpacity,setBodyOpacity]=useState(.45),[showPoints,setShowPoints]=useState(true),[showBodies,setShowBodies]=useState(true),[showLabels,setShowLabels]=useState(false),[includeImage,setIncludeImage]=useState(false),[toast,setToast]=useState('');
  const [view,setView]=useState({zoom:1,x:0,y:0}),[historyCount,setHistoryCount]=useState(0),[redoCount,setRedoCount]=useState(0);
  const history=useRef<ReferenceProject[]>([]),future=useRef<ReferenceProject[]>([]),sliderStart=useRef<ReferenceProject|null>(null),drag=useRef<Drag|null>(null),space=useRef(false),imageInput=useRef<HTMLInputElement>(null),projectInput=useRef<HTMLInputElement>(null),svgRef=useRef<SVGSVGElement>(null),previewRef=useRef<SVGSVGElement>(null),toastTimer=useRef(0),autosaveTimer=useRef(0),changedDuringLoad=useRef(false);
  const [stageSize,setStageSize]=useState({width:800,height:500});
  const notice=(text:string)=>{setToast(text);clearTimeout(toastTimer.current);toastTimer.current=window.setTimeout(()=>setToast(''),4500);};
  const pushHistory=(before:ReferenceProject)=>{history.current.push(before);if(history.current.length>60)history.current.shift();future.current=[];setHistoryCount(history.current.length);setRedoCount(0);};
  const commit=(next:ReferenceProject)=>{if(next===projectRef.current)return;changedDuringLoad.current=true;if(!sliderStart.current)pushHistory(projectRef.current);setProject(next);projectRef.current=next;};
  const undo=()=>{const previous=history.current.pop();if(!previous)return;future.current.push(projectRef.current);setProject(previous);projectRef.current=previous;setHistoryCount(history.current.length);setRedoCount(future.current.length);};
  const redo=()=>{const next=future.current.pop();if(!next)return;history.current.push(projectRef.current);setProject(next);projectRef.current=next;setHistoryCount(history.current.length);setRedoCount(future.current.length);};
  useEffect(()=>{
    let active=true;
    readReference().then(data=>{if(active&&data&&!changedDuringLoad.current){try{setProject(validateReference(data));}catch{notice('上次项目无法恢复，已使用示例起点');}}}).catch(()=>{if(active)setSaveStatus('自动保存不可用，请下载项目保存');}).finally(()=>{if(active)setReady(true);});
    return()=>{active=false;clearTimeout(toastTimer.current);clearTimeout(autosaveTimer.current);if(changedDuringLoad.current)void storeReference(projectRef.current).catch(()=>{});};
  },[]);
  useEffect(()=>{
    if(!ready)return;setSaveStatus('正在保存到本机…');clearTimeout(autosaveTimer.current);
    autosaveTimer.current=window.setTimeout(()=>{storeReference(project).then(()=>setSaveStatus('已自动保存到本机')).catch(()=>setSaveStatus('自动保存失败，请下载项目保存'));},400);
    // Keep pending save alive when switching to the 3D workspace.
  },[project,ready]);
  useEffect(()=>{const svg=svgRef.current;if(!svg)return;const observer=new ResizeObserver(entries=>{const r=entries[0].contentRect;setStageSize({width:r.width,height:r.height});});observer.observe(svg);return()=>observer.disconnect();},[]);
  useEffect(()=>{
    const svg=svgRef.current;if(!svg)return;
    const wheel=(e:WheelEvent)=>{e.preventDefault();setView(v=>({...v,zoom:Math.max(.35,Math.min(4,v.zoom*Math.exp(-e.deltaY*.0015)))}));};svg.addEventListener('wheel',wheel,{passive:false});return()=>svg.removeEventListener('wheel',wheel);
  },[]);
  useEffect(()=>{const finish=()=>{const before=sliderStart.current;sliderStart.current=null;if(before&&before!==projectRef.current)pushHistory(before);};window.addEventListener('pointerup',finish);window.addEventListener('pointercancel',finish);return()=>{window.removeEventListener('pointerup',finish);window.removeEventListener('pointercancel',finish);};},[]);
  useEffect(()=>{
    const keydown=(e:KeyboardEvent)=>{if((e.target as HTMLElement).matches('input,select,textarea'))return;
      if(e.code==='Space'){e.preventDefault();space.current=true;}
      if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?redo():undo();}
      if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();redo();}
      const delta:Record<string,[number,number]>={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
      if(delta[e.key]){e.preventDefault();const [dx,dy]=delta[e.key],p=projectRef.current.points[selected],step=e.shiftKey?10:1;commit(movePoint(projectRef.current,selected,{x:p.x+dx*step,y:p.y+dy*step},mode));}
    };const keyup=(e:KeyboardEvent)=>{if(e.code==='Space')space.current=false;};const blur=()=>{space.current=false;};window.addEventListener('keydown',keydown);window.addEventListener('keyup',keyup);window.addEventListener('blur',blur);return()=>{window.removeEventListener('keydown',keydown);window.removeEventListener('keyup',keyup);window.removeEventListener('blur',blur);};
  });
  const {width:w,height:h}=project.image;
  const scale=Math.min(stageSize.width/w,stageSize.height/h)*view.zoom,unit=1/Math.max(.001,scale);
  const viewBox=`${w/2-w/(2*view.zoom)-view.x} ${h/2-h/(2*view.zoom)-view.y} ${w/view.zoom} ${h/view.zoom}`;
  const toWorld=(e:{clientX:number;clientY:number})=>{const m=svgRef.current?.getScreenCTM();if(!m)return {x:0,y:0};return new DOMPoint(e.clientX,e.clientY).matrixTransform(m.inverse());};
  const choose=(id:NodeId)=>{setSelected(id);const part=project.parts.find(p=>p.center===id)||project.parts.find(p=>p.to===id)||project.parts.find(p=>p.from===id);if(part)setPartId(part.id);};
  const pointDown=(e:ReactPointerEvent<SVGCircleElement>,id:NodeId)=>{if(e.button!==0||space.current)return;e.stopPropagation();choose(id);if(project.points[id].locked){notice('此点已固定，请先解除固定');return;}const position=toWorld(e),p=project.points[id];drag.current={id,before:project,offset:{x:p.x-position.x,y:p.y-position.y},moved:false};svgRef.current?.setPointerCapture(e.pointerId);};
  const pointerDown=(e:ReactPointerEvent<SVGSVGElement>)=>{if(e.button===1||e.button===0){e.preventDefault();drag.current={pan:true,x:e.clientX,y:e.clientY,view};e.currentTarget.setPointerCapture(e.pointerId);}};
  const pointerMove=(e:ReactPointerEvent<SVGSVGElement>)=>{const d=drag.current;if(!d)return;if('pan'in d){setView({...d.view,x:d.view.x+(e.clientX-d.x)*unit,y:d.view.y+(e.clientY-d.y)*unit});return;}const p=toWorld(e),next=movePoint(d.before,d.id,{x:p.x+d.offset.x,y:p.y+d.offset.y},mode);if(next!==d.before){d.moved=true;changedDuringLoad.current=true;setProject(next);projectRef.current=next;}};
  const pointerUp=(e:ReactPointerEvent<SVGSVGElement>)=>{const d=drag.current;if(d&&!('pan'in d)&&d.moved)pushHistory(d.before);drag.current=null;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);};
  const patchPoint=(patch:Partial<typeof project.points[NodeId]>)=>{commit({...project,points:{...project.points,[selected]:{...project.points[selected],...patch}}});};
  const patchPart=(patch:Partial<Part>)=>commit({...project,parts:project.parts.map(p=>p.id===partId?{...p,...patch}:p)});
  const importImage=async(file:File)=>{
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)){notice('请选择 JPG、PNG 或 WebP 图片');return;}if(file.size>15*1024*1024){notice('请选择 15 MB 以内的图片');return;}
    try{const src=await asDataURL(file),img=new Image();img.src=src;await img.decode();if(img.width>20000||img.height>20000)throw Error('图片边长请控制在 20000 像素以内');commit(createReference(img.width,img.height,src,file.name,false));setView({zoom:1,x:0,y:0});notice('图片已导入，拖动关键点对齐人物');}catch(e){notice(e instanceof Error?e.message:'图片读取失败');}
  };
  const saveProject=async()=>{try{const portable=await portableReference(project);const url=URL.createObjectURL(new Blob([JSON.stringify(portable)],{type:'application/json'}));download(url,'pose-reference-project.json');setTimeout(()=>URL.revokeObjectURL(url),1000);notice('已保存项目，包含参考图和所有关键点');}catch{notice('保存失败，请重试');}};
  const exportImage=async()=>{
    try{const portable=includeImage?await portableReference(project):project;await nextFrames();const svg=previewRef.current!.cloneNode(true) as SVGSVGElement;svg.setAttribute('xmlns','http://www.w3.org/2000/svg');svg.setAttribute('width',String(w));svg.setAttribute('height',String(h));if(includeImage){const original=svg.querySelector('image');original?.setAttribute('href',portable.image.src);}const xml=new XMLSerializer().serializeToString(svg);const url=URL.createObjectURL(new Blob([xml],{type:'image/svg+xml;charset=utf-8'}));try{const img=new Image();img.src=url;await img.decode();const canvas=document.createElement('canvas'),factor=2048/Math.max(w,h);canvas.width=Math.max(1,Math.round(w*factor));canvas.height=Math.max(1,Math.round(h*factor));canvas.getContext('2d')!.drawImage(img,0,0,canvas.width,canvas.height);download(canvas.toDataURL('image/png'),'pose-reference-2d.png');notice('已导出参考图 · 长边 2048 px');}finally{URL.revokeObjectURL(url);}}catch{notice('导出失败，请确认图片已加载完成');}
  };
  const selectedPoint=project.points[selected],part=project.parts.find(p=>p.id===partId)!;
  const mirror=()=>{const points=Object.fromEntries(Object.entries(project.points).map(([id,p])=>[id,{...p,x:p.locked?p.x:w-p.x}])) as ReferenceProject['points'];commit({...project,points,parts:project.parts.map(p=>({...p,angle:-p.angle}))});notice('已水平翻转可移动体块；固定点保持原位');};
  const reset=()=>{commit(createReference(w,h,project.image.src,project.image.name,project.layout==='sample'));notice('关键点与体块已复位');};
  const pointName=NODE_META.find(n=>n.id===selected)!.name;
  return <div className="reference-shell">
    <header className="reference-header"><div className="reference-title"><ScanLine size={24}/><div><h1>参考图工作台</h1><p>对齐画面，再修改姿态与比例</p></div></div><div className="reference-actions"><button className="icon-button" aria-label="二维撤销" title="撤销 Ctrl+Z" disabled={!historyCount} onClick={undo}><Undo2 size={18}/></button><button className="icon-button" aria-label="二维重做" title="重做 Ctrl+Y" disabled={!redoCount} onClick={redo}><Redo2 size={18}/></button><button onClick={()=>imageInput.current?.click()}><ImagePlus size={16}/>导入图片</button><button onClick={()=>projectInput.current?.click()}><Upload size={16}/>打开项目</button><button onClick={saveProject}><Save size={16}/>保存项目</button><button className="primary" onClick={exportImage}><Download size={16}/>导出参考图</button></div></header>
    <main className="reference-workspace"><div className="reference-views">
      <section className="reference-editor"><div className="panel-bar"><div className="panel-title"><ScanLine size={17}/><h2>沿参考图对齐</h2><span className="reference-tag">2D</span></div><div className="reference-tools"><button aria-label="缩小画布" onClick={()=>setView(v=>({...v,zoom:Math.max(.35,v.zoom/1.25)}))}><ZoomOut size={16}/></button><span>{Math.round(view.zoom*100)}%</span><button aria-label="放大画布" onClick={()=>setView(v=>({...v,zoom:Math.min(4,v.zoom*1.25)}))}><ZoomIn size={16}/></button><button title="适应画布" aria-label="适应画布" onClick={()=>setView({zoom:1,x:0,y:0})}><Maximize size={16}/></button></div></div>
        <div className="reference-stage" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();const file=e.dataTransfer.files[0];if(file)void importImage(file);}}>
          <svg ref={svgRef} className="reference-svg" role="img" aria-label="可拖动关键点的参考图画布" viewBox={viewBox} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} onContextMenu={e=>e.preventDefault()}>
            <rect x="0" y="0" width={w} height={h} fill="#fff"/><image href={project.image.src} x="0" y="0" width={w} height={h} opacity={imageOpacity} pointerEvents="none"/>
            {showBodies&&<g opacity={bodyOpacity} pointerEvents="none"><Body project={project} prefix="edit" outline/></g>}
            <rect x="0" y="0" width={w} height={h} fill="none" stroke="#789590" strokeWidth={unit} pointerEvents="none"/>
            {showPoints&&<g className="reference-handles">
              {LINKS.map(([a,b])=><line key={`${a}-${b}`} x1={project.points[a].x} y1={project.points[a].y} x2={project.points[b].x} y2={project.points[b].y} stroke={project.points[a].inferred||project.points[b].inferred?'#c09340':'#145e50'} strokeWidth={2*unit} strokeDasharray={project.points[a].inferred||project.points[b].inferred?`${5*unit} ${4*unit}`:undefined} pointerEvents="none"/>)}
              {NODE_META.map(({id,name})=>{const p=project.points[id],active=selected===id;return <g key={id}><circle data-node={id} className={`reference-node ${p.locked?'is-locked':''}`} aria-label={name} role="button" tabIndex={0} cx={p.x} cy={p.y} r={16*unit} fill="transparent" onPointerDown={e=>pointDown(e,id)} onFocus={()=>choose(id)} onKeyDown={e=>{if(e.key==='Enter'){choose(id);e.preventDefault();}}}/><circle cx={p.x} cy={p.y} r={(active?7:5)*unit} fill={p.locked?'#d5906b':active?'#f4fffa':p.inferred?'#efc46f':'#82ecd1'} stroke={active?'#184a3b':'#263e3c'} strokeWidth={2*unit} pointerEvents="none"/>{p.locked&&<path d={`M ${p.x-2*unit} ${p.y} l ${2*unit} ${2*unit} l ${4*unit} ${-4*unit}`} fill="none" stroke="#38251a" strokeWidth={1.5*unit} pointerEvents="none"/>}{(showLabels||active)&&<g pointerEvents="none"><rect x={p.x+11*unit} y={p.y-13*unit} width={(name.length*13+(p.inferred?38:12))*unit} height={25*unit} rx={4*unit} fill="#152721" opacity=".93"/><text x={p.x+17*unit} y={p.y+4*unit} fill="#e8fff5" fontSize={12*unit} fontFamily="sans-serif">{name}{p.inferred?' · 推测':''}</text></g>}</g>;})}
            </g>}
          </svg>
          <div className="reference-stage-hint"><span className="mint-dot"/>{mode==='align'?'拖点对齐原图':'手脚拖动带动肢段'}<span>拖空白平移 · 滚轮缩放</span></div>
        </div><div className="reference-editor-footer"><span className="legend-dot visible-point"/>可定位关键点<span className="legend-dot inferred-point"/>遮挡 / 画外推测点<span className="legend-dot locked-point"/>已固定<span className="reference-file-name" title={project.image.name}>{project.image.name}</span></div>
      </section>
      <section className="reference-preview"><div className="panel-bar"><div className="panel-title"><Layers size={17}/><h2>干净体块预览</h2><span className="live-tag">LIVE</span></div><label className="check-label"><input type="checkbox" checked={includeImage} onChange={e=>setIncludeImage(e.target.checked)}/>包含底图</label></div><div className="reference-preview-stage"><svg ref={previewRef} xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${w} ${h}`} role="img" aria-label="二维体块实时预览"><defs><clipPath id="preview-artboard"><rect width={w} height={h}/></clipPath></defs><g clipPath="url(#preview-artboard)"><rect width={w} height={h} fill="#f6f8f8"/>{includeImage&&<image href={project.image.src} width={w} height={h} opacity=".65"/>}<Body project={project} prefix="preview"/></g></svg><div className="preview-explainer"><span>画面优先</span><p>保留局部比例与透视夸张。<br/>不显示关键点、连线和选中标记。</p></div></div></section>
    </div>
    <aside className="reference-inspector"><div className="reference-inspector-heading"><h2>画面与体块</h2><span>本地编辑</span></div><div className="reference-inspector-scroll" onPointerDownCapture={e=>{if((e.target as HTMLElement).matches('input[type=range]'))sliderStart.current=projectRef.current;}}>
      <div className="reference-mode"><button className={mode==='align'?'active':''} onClick={()=>setMode('align')}><ScanLine size={17}/><span>对齐原图<small>关键点自由移动</small></span></button><button className={mode==='pose'?'active':''} onClick={()=>setMode('pose')}><Hand size={17}/><span>修改动作<small>手脚带动肢段</small></span></button></div><p className="reference-tip">{mode==='align'?'先对齐看得见的位置。被衣服遮挡或画外的关节，只需给出合理的起点。':'拖手或脚踝带动肘膝；拖躯干带动相连部位。固定的点优先保持原位。'}</p>
      <div className="section-heading"><span>图层显示</span><button className="text-button" onClick={()=>{setImageOpacity(imageOpacity?0:.75);}}>{imageOpacity?<Eye size={14}/>:<EyeOff size={14}/>}底图</button></div>
      <label className="reference-range">底图透明度<span>{Math.round(imageOpacity*100)}%</span><input aria-label="底图透明度" type="range" min="0" max="1" step=".01" value={imageOpacity} onChange={e=>setImageOpacity(Number(e.target.value))}/></label>
      <label className="reference-range">体块透明度<span>{Math.round(bodyOpacity*100)}%</span><input aria-label="体块透明度" type="range" min="0" max="1" step=".01" value={bodyOpacity} onChange={e=>setBodyOpacity(Number(e.target.value))}/></label>
      <div className="reference-checks"><label><input type="checkbox" checked={showPoints} onChange={e=>setShowPoints(e.target.checked)}/>关键点</label><label><input type="checkbox" checked={showBodies} onChange={e=>setShowBodies(e.target.checked)}/>体块</label><label><input type="checkbox" checked={showLabels} onChange={e=>setShowLabels(e.target.checked)}/>名称</label></div>
      <div className="section-heading separated"><span>当前关键点</span><button className="text-button" onClick={()=>patchPoint({locked:!selectedPoint.locked})}>{selectedPoint.locked?<UnlockKeyhole size={14}/>:<LockKeyhole size={14}/>} {selectedPoint.locked?'解除固定':'固定此点'}</button></div>
      <label className="select-wrap reference-node-select"><select aria-label="选择二维关键点" value={selected} onChange={e=>choose(e.target.value as NodeId)}>{NODE_META.map(n=><option key={n.id} value={n.id}>{n.name}{project.points[n.id].locked?' · 已固定':''}{project.points[n.id].inferred?' · 推测':''}</option>)}</select><ChevronDown size={16}/></label>
      <div className="reference-position">{(['x','y'] as const).map(axis=><label key={axis}>{axis.toUpperCase()}<input aria-label={`${pointName}${axis.toUpperCase()}位置`} type="number" step="1" value={Math.round(selectedPoint[axis])} disabled={selectedPoint.locked} onChange={e=>{if(Number.isFinite(e.target.valueAsNumber)){const n=Math.max(-5*(axis==='x'?w:h),Math.min(5*(axis==='x'?w:h),e.target.valueAsNumber));commit(movePoint(project,selected,{...selectedPoint,[axis]:n},mode));}}}/><span>px</span></label>)}</div>
      <label className="check-label inferred-check"><input type="checkbox" checked={selectedPoint.inferred} onChange={e=>patchPoint({inferred:e.target.checked})}/>此位置是遮挡 / 画外推测</label>
      <div className="section-heading separated"><span>局部体块</span><span className="small-label">允许比例夸张</span></div>
      <label className="select-wrap reference-node-select"><select aria-label="选择二维体块" value={partId} onChange={e=>setPartId(e.target.value)}>{project.parts.map(p=><option key={p.id} value={p.id}>{p.name}{p.visible?'':' · 已隐藏'}</option>)}</select><ChevronDown size={16}/></label>
      <label className="reference-range">{part.kind==='limb'?'粗细':'宽度'}<span>{Math.round(part.width*w)} px</span><input aria-label="体块宽度" type="range" min=".02" max="1" step=".005" value={part.width} onChange={e=>patchPart({width:Number(e.target.value)})}/></label>
      {part.kind!=='limb'&&<><label className="reference-range">高度<span>{Math.round(part.height*h)} px</span><input aria-label="体块高度" type="range" min=".015" max=".65" step=".005" value={part.height} onChange={e=>patchPart({height:Number(e.target.value)})}/></label><label className="reference-range">画面内倾斜<span>{part.angle}°</span><input aria-label="体块倾斜" type="range" min="-180" max="180" value={part.angle} onChange={e=>patchPart({angle:Number(e.target.value)})}/></label></>}
      <label className="reference-range">遮挡顺序<span>{part.depth} · 越大越靠前</span><input aria-label="体块遮挡顺序" type="range" min="0" max="100" value={part.depth} onChange={e=>patchPart({depth:Number(e.target.value)})}/></label>
      <label className="check-label"><input type="checkbox" checked={part.visible} onChange={e=>patchPart({visible:e.target.checked})}/>显示此体块</label>
      <div className="section-heading separated"><span>起点与复位</span></div><div className="reference-bottom-actions"><button onClick={()=>{commit(createReference());setView({zoom:1,x:0,y:0});notice('已载入你的参考图与手工标记起点');}}><ImagePlus size={15}/>使用这张示例</button><button onClick={mirror}><FlipHorizontal2 size={15}/>翻转体块</button><button onClick={reset}><RotateCcw size={15}/>复位关键点</button></div><p className="reference-tip">示例起点为手工设置，并非自动识别。看不清的上肢体块初始隐藏，可在上方开启。画面左 / 右按图像方向命名。二维体块暂不自动转换为三维人偶。</p>
    </div><div className="reference-save-status"><span className="mint-dot"/>{ready?saveStatus:'恢复本地项目…'}</div></aside></main>
    <footer className="reference-status"><span><Move size={13}/>直接拖动关键点 · 方向键微调 · Shift 加速</span><span>图片仅在本机处理 · 导出遵循当前画幅</span></footer>
    <input hidden type="file" ref={imageInput} accept="image/jpeg,image/png,image/webp" onChange={e=>{const file=e.target.files?.[0];if(file)void importImage(file);e.target.value='';}}/>
    <input hidden type="file" ref={projectInput} accept=".json,application/json" onChange={async e=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;if(file.size>30*1024*1024){notice('项目文件过大');return;}try{const next=validateReference(JSON.parse(await file.text()));const decoded=new Image();decoded.src=next.image.src;await decoded.decode();commit(next);setView({zoom:1,x:0,y:0});notice('项目已恢复');}catch(error){notice(error instanceof Error?error.message:'无法打开项目');}}}/>
    {toast&&<div className="toast" role="status"><Check size={17}/>{toast}</div>}
  </div>;
}
