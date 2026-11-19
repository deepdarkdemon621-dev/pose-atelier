import * as T from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { Rig } from './rig';
export type CameraSettings = { azimuth: number; elevation: number; distance: number; targetX: number; targetY: number; targetZ: number; focal: number; roll: number; aspect: string };
export type SavedScene = {version: 1; pose: Record<string,number[]>; camera: CameraSettings};
const defaults: CameraSettings={azimuth:20,elevation:8,distance:4.1,targetX:0,targetY:1,targetZ:0,focal:50,roll:0,aspect:'3:2'};
export class Studio {
  scene=new T.Scene();
  editor=new T.PerspectiveCamera(42,1,.01,100);
  camera=new T.PerspectiveCamera(40,1.5,.02,100);
  renderer: T.WebGLRenderer;
  preview: T.WebGLRenderer;
  orbit: OrbitControls;
  transform: TransformControls;
  rig: Rig;
  helper: T.CameraHelper;
  cameraIcon=new T.Group();
  visualCamera=new T.PerspectiveCamera();
  cameraSettings={...defaults};
  selected='leftShoulder';
  callback=()=>{};
  undoStack: string[]=[]; redoStack: string[]=[];
  frame=0; disposed=false;
  observers: ResizeObserver[]=[];
  cleanup: (()=>void)[]=[];
  constructor(public editorHost: HTMLElement,public previewHost: HTMLElement) {
    this.scene.background=new T.Color(0x232b30);
    this.renderer=new T.WebGLRenderer({antialias:true}); this.preview=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
    for(const renderer of [this.renderer,this.preview]) {renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;}
    editorHost.append(this.renderer.domElement); previewHost.append(this.preview.domElement);
    this.editor.position.set(-2.6,1.8,2.8);this.editor.layers.enable(1);
    this.orbit=new OrbitControls(this.editor,this.renderer.domElement);this.orbit.target.set(0,1,0);this.orbit.enableDamping=true;this.orbit.minDistance=.5;this.orbit.maxDistance=20;this.orbit.maxPolarAngle=Math.PI*.92;
    this.scene.add(new T.HemisphereLight(0xe2efff,0x42505b,2.1));
    const key=new T.DirectionalLight(0xfff1dd,3.3);key.position.set(2,4,3);key.castShadow=true;key.shadow.mapSize.set(2048,2048);key.shadow.camera.left=-3;key.shadow.camera.right=3;key.shadow.camera.top=3;key.shadow.camera.bottom=-3;key.shadow.normalBias=.02;this.scene.add(key);
    const rim=new T.DirectionalLight(0x94d9ed,2);rim.position.set(-3,2,-2);this.scene.add(rim);
    const floor=new T.Mesh(new T.PlaneGeometry(200,200),new T.MeshStandardMaterial({color:0x303a40,roughness:.95}));floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;this.scene.add(floor);
    const grid=new T.GridHelper(12,48,0x63747b,0x3c494f);grid.position.y=.003;grid.layers.set(1);this.scene.add(grid);
    const axes=new T.AxesHelper(.35);axes.position.set(-.65,.01,0);axes.layers.set(1);this.scene.add(axes);
    this.rig=new Rig(this.scene);
    this.scene.add(this.camera);
    this.helper=new T.CameraHelper(this.visualCamera);const helperColor=new T.Color(0x5caaa4);this.helper.setColors(helperColor,helperColor,helperColor,helperColor,helperColor);this.helper.layers.set(1);this.scene.add(this.helper);
    const helperMaterial=this.helper.material as T.LineBasicMaterial;helperMaterial.transparent=true;helperMaterial.opacity=.35;
    const iconBody=new T.Mesh(new T.BoxGeometry(.19,.13,.16),new T.MeshBasicMaterial({color:0x6ce0c9,wireframe:true}));
    const lens=new T.Mesh(new T.ConeGeometry(.095,.13,4),new T.MeshBasicMaterial({color:0x6ce0c9,wireframe:true}));lens.rotation.x=-Math.PI/2;lens.position.z=-.12;
    this.cameraIcon.add(iconBody,lens);this.cameraIcon.traverse(o=>o.layers.set(1));this.scene.add(this.cameraIcon);
    this.transform=new TransformControls(this.editor,this.renderer.domElement);this.transform.setMode('rotate');this.transform.setSpace('local');this.transform.setSize(.8);
    this.transform.getHelper().traverse(o=>o.layers.set(1));this.transform.getRaycaster().layers.enable(1);this.scene.add(this.transform.getHelper());
    this.transform.addEventListener('dragging-changed',e=>{this.orbit.enabled=!e.value;if(e.value)this.checkpoint();else this.changed();});
    this.transform.addEventListener('objectChange',()=>{const j=this.rig.get(this.selected);if(j){this.rig.set(j,this.rig.angles(j));this.changed();}});
    const down={x:0,y:0};
    const onDown=(e:PointerEvent)=>{down.x=e.clientX;down.y=e.clientY;};
    const onUp=(e:PointerEvent)=>{
      if(e.button!==0||Math.hypot(e.clientX-down.x,e.clientY-down.y)>4||this.transform.dragging||this.transform.axis)return;
      const rect=this.renderer.domElement.getBoundingClientRect();const ray=new T.Raycaster();ray.setFromCamera(new T.Vector2((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1),this.editor);
      const hit=ray.intersectObjects(this.rig.pickables)[0];if(hit)this.select(hit.object.userData.joint);
    };
    this.renderer.domElement.addEventListener('pointerdown',onDown);this.renderer.domElement.addEventListener('pointerup',onUp);
    this.cleanup.push(()=>{this.renderer.domElement.removeEventListener('pointerdown',onDown);this.renderer.domElement.removeEventListener('pointerup',onUp);});
    const observer=new ResizeObserver(()=>this.resize());observer.observe(editorHost);observer.observe(previewHost);this.observers.push(observer);
    this.updateCamera();this.select(this.selected);this.resize();this.animate();
  }
  aspectValue() {const [w,h]=this.cameraSettings.aspect.split(':').map(Number);return w/h;}
  resize() {
    const w=this.editorHost.clientWidth,h=this.editorHost.clientHeight;if(w&&h){this.renderer.setSize(w,h);this.editor.aspect=w/h;this.editor.updateProjectionMatrix();}
    const pw=this.previewHost.clientWidth,ph=this.previewHost.clientHeight,a=this.aspectValue();const rw=Math.max(1,Math.min(pw,ph*a)),rh=rw/a;this.preview.setSize(rw,rh);this.camera.aspect=a;this.camera.updateProjectionMatrix();this.helper.update();
  }
  updateCamera() {
    const c=this.cameraSettings,a=T.MathUtils.degToRad(c.azimuth),e=T.MathUtils.degToRad(c.elevation);
    const target=new T.Vector3(c.targetX,c.targetY,c.targetZ);
    this.camera.position.set(c.distance*Math.cos(e)*Math.sin(a),c.distance*Math.sin(e),c.distance*Math.cos(e)*Math.cos(a)).add(target);
    this.camera.up.set(0,1,0);this.camera.lookAt(target);this.camera.rotateZ(T.MathUtils.degToRad(c.roll));this.camera.setFocalLength(c.focal);this.camera.aspect=this.aspectValue();this.camera.updateProjectionMatrix();
    this.cameraIcon.position.copy(this.camera.position);this.cameraIcon.quaternion.copy(this.camera.quaternion);
    this.visualCamera.copy(this.camera);this.visualCamera.far=c.distance;this.visualCamera.updateProjectionMatrix();this.visualCamera.updateMatrixWorld();this.helper.update();
  }
  setCamera(key: keyof CameraSettings,value: number|string) {this.checkpoint();this.cameraSettings={...this.cameraSettings,[key]:value};this.updateCamera();this.resize();this.changed();}
  select(id:string) {
    const j=this.rig.get(id);if(!j)return;this.selected=id;this.transform.attach(j.node);
    this.transform.showX=j.limits[0][0]!==j.limits[0][1];this.transform.showY=j.limits[1][0]!==j.limits[1][1];this.transform.showZ=j.limits[2][0]!==j.limits[2][1];this.rig.highlight(id);this.callback();
  }
  setAngle(axis:number,value:number){this.checkpoint();const j=this.rig.get(this.selected),a=this.rig.angles(j);a[axis]=value;this.rig.set(j,a);this.changed();}
  resetJoint(){this.checkpoint();const j=this.rig.get(this.selected);this.rig.set(j,j.home);this.changed();}
  resetAll(){this.checkpoint();this.rig.reset();this.changed();}
  mirror(){this.checkpoint();const pose=this.rig.pose();this.rig.joints.forEach(j=>{const other=j.id.startsWith('left')?j.id.replace('left','right'):j.id.startsWith('right')?j.id.replace('right','left'):j.id;const a=pose[other];this.rig.set(j,[a[0],-a[1],-a[2]]);});this.changed();}
  preset(name:string){this.checkpoint();this.rig.reset();const set=(id:string,a:number[])=>this.rig.set(this.rig.get(id),a);
    if(name==='reach'){set('leftShoulder',[-115,-10,35]);set('leftElbow',[-25,0,0]);set('chest',[0,-15,8]);set('head',[-10,-15,0]);set('rightElbow',[-25,0,0]);}
    if(name==='stride'){set('leftHip',[-40,0,0]);set('leftKnee',[25,0,0]);set('rightHip',[20,0,0]);set('rightKnee',[55,0,0]);set('leftShoulder',[25,0,8]);set('rightShoulder',[-35,0,-8]);set('leftElbow',[-50,0,0]);set('rightElbow',[-65,0,0]);set('waist',[8,0,0]);}
    this.changed();
  }
  view(direction:string){const target=new T.Vector3(0,1,0);const offsets:Record<string,number[]>={front:[0,.1,3.5],side:[3.5,.1,0],top:[0,3.5,.01],perspective:[-2.6,.8,2.8]};this.editor.position.copy(target).add(new T.Vector3().fromArray(offsets[direction]));this.orbit.target.copy(target);this.orbit.update();}
  useEditorCamera(){this.checkpoint();const delta=this.editor.position.clone().sub(this.orbit.target);this.cameraSettings={...this.cameraSettings,azimuth:T.MathUtils.radToDeg(Math.atan2(delta.x,delta.z)),elevation:T.MathUtils.radToDeg(Math.asin(delta.y/delta.length())),distance:delta.length(),targetX:this.orbit.target.x,targetY:this.orbit.target.y,targetZ:this.orbit.target.z,roll:0};this.cameraSettings.focal=this.camera.getFilmHeight()/(2*Math.tan(T.MathUtils.degToRad(this.editor.fov/2)));this.updateCamera();this.changed();}
  snapshot():SavedScene{return {version:1,pose:this.rig.pose(),camera:{...this.cameraSettings}};}
  checkpoint(){const text=JSON.stringify(this.snapshot());if(this.undoStack.at(-1)!==text)this.undoStack.push(text);if(this.undoStack.length>100)this.undoStack.shift();this.redoStack=[];}
  undo(){const prev=this.undoStack.pop();if(!prev)return;this.redoStack.push(JSON.stringify(this.snapshot()));this.restore(JSON.parse(prev));}
  redo(){const next=this.redoStack.pop();if(!next)return;this.undoStack.push(JSON.stringify(this.snapshot()));this.restore(JSON.parse(next));}
  restore(data:unknown) {
    const d=data as SavedScene;if(!d||d.version!==1||!d.pose||typeof d.pose!=='object'||!d.camera)throw Error('场景文件格式不正确');
    const c=d.camera;const bounds: Record<string,[number,number]>={azimuth:[-360,360],elevation:[-89,89],distance:[.3,30],targetX:[-10,10],targetY:[-5,10],targetZ:[-10,10],focal:[12,200],roll:[-180,180]};
    for(const [key,[min,max]]of Object.entries(bounds)){const v=c[key as keyof CameraSettings];if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)throw Error('相机参数超出支持范围');}
    if(!['3:2','2:3','1:1','16:9','9:16'].includes(c.aspect))throw Error('不支持的画幅比例');
    for(const j of this.rig.joints){const a=d.pose[j.id];if(!Array.isArray(a)||a.length!==3||!a.every(v=>typeof v==='number'&&Number.isFinite(v)))throw Error('关节数据不完整');}
    this.rig.restore(d.pose);this.cameraSettings={...c};this.updateCamera();this.resize();this.changed();
  }
  changed(){try{localStorage.setItem('pose-atelier-v1',JSON.stringify(this.snapshot()));}catch{/* Storage may be unavailable. */}this.callback();}
  setHelpers(visible:boolean){this.editor.layers[visible?'enable':'disable'](1);}
  exportPNG(){const size=new T.Vector2();this.preview.getSize(size);const ratio=this.preview.getPixelRatio();this.preview.setPixelRatio(1);const a=this.aspectValue();this.preview.setSize(a>=1?2048:Math.round(2048*a),a>=1?Math.round(2048/a):2048,false);this.rig.highlight(null);this.preview.render(this.scene,this.camera);const url=this.preview.domElement.toDataURL('image/png');this.preview.setPixelRatio(ratio);this.preview.setSize(size.x,size.y);this.rig.highlight(this.selected);return url;}
  animate=()=>{if(this.disposed)return;this.frame=requestAnimationFrame(this.animate);this.orbit.update();this.scene.updateMatrixWorld();this.rig.highlight(this.selected);this.renderer.render(this.scene,this.editor);this.rig.highlight(null);this.preview.render(this.scene,this.camera);};
  dispose(){this.disposed=true;cancelAnimationFrame(this.frame);this.observers.forEach(o=>o.disconnect());this.cleanup.forEach(f=>f());this.transform.dispose();this.orbit.dispose();this.scene.traverse(o=>{if(o instanceof T.Mesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});this.renderer.dispose();this.preview.dispose();this.renderer.domElement.remove();this.preview.domElement.remove();}
}
