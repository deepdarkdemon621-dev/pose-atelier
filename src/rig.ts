import * as T from 'three';
import { constrainAngles } from './limits.mjs';
export type Angles = [number, number, number];
export type Limits = [AnglesPair, AnglesPair, AnglesPair];
type AnglesPair = [number, number];
export type Joint = { id: string; name: string; group: string; node: T.Group; limits: Limits; labels: string[]; coupled: boolean; home: Angles; meshes: T.Mesh[] };
const D = T.MathUtils.DEG2RAD;
export class Rig {
  root = new T.Group();
  joints: Joint[] = [];
  pickables: T.Mesh[] = [];
  bodyMaterial = new T.MeshStandardMaterial({color: 0xc5d2d6, roughness: .65, metalness: .08});
  jointMaterial = new T.MeshStandardMaterial({color: 0x53636c, roughness: .72});
  constructor(scene: T.Scene) {
    scene.add(this.root);
    const joint = (id: string, name: string, section: string, parent: T.Object3D, position: number[], limits: Limits, labels: string[], coupled = false, home: Angles = [0,0,0]) => {
      const node = new T.Group(); node.position.fromArray(position); parent.add(node);
      const j: Joint = {id,name,group: section,node,limits,labels,coupled,home,meshes: []};
      this.joints.push(j); return j;
    };
    const mesh = (j: Joint, geometry: T.BufferGeometry, position: number[], scale = [1,1,1], mat = this.bodyMaterial) => {
      const m = new T.Mesh(geometry, mat.clone()); m.position.fromArray(position); m.scale.fromArray(scale);
      m.castShadow = true; m.receiveShadow = true; m.userData.joint = j.id; j.node.add(m); j.meshes.push(m); this.pickables.push(m); return m;
    };
    const ellipsoid = (j: Joint, p: number[], s: number[], mat = this.bodyMaterial) => mesh(j,new T.SphereGeometry(1,32,24),p,s,mat);
    const ball = (j: Joint, r: number) => ellipsoid(j,[0,0,0],[r,r,r],this.jointMaterial);
    const limb = (j: Joint, length: number, top: number, bottom: number) => mesh(j,new T.CylinderGeometry(top,bottom,length-.055,24),[0,-length/2,0]);
    const pelvis = joint('pelvis','骨盆','躯干',this.root,[0,1.01,0],[[-25,25],[-45,45],[-20,20]],['前后倾','转身','左右倾'],true);
    ellipsoid(pelvis,[0,0,0],[.185,.14,.115]);
    const waist = joint('waist','腰部','躯干',pelvis.node,[0,.12,0],[[-25,30],[-30,30],[-25,25]],['前后弯','扭转','侧弯'],true);
    ellipsoid(waist,[0,.075,0],[.125,.12,.09]);
    const chest = joint('chest','胸腔','躯干',waist.node,[0,.14,0],[[-20,30],[-30,30],[-20,20]],['前后弯','扭转','侧弯'],true);
    ellipsoid(chest,[0,.13,0],[.225,.21,.125]);
    ellipsoid(chest,[0,.16,.119],[.025,.11,.008],this.jointMaterial);
    const neck = joint('neck','颈部','躯干',chest.node,[0,.34,0],[[-25,35],[-40,40],[-25,25]],['抬头 / 低头','转头','侧倾'],true);
    limb(neck,.055,.046,.05);
    const head = joint('head','头部','躯干',neck.node,[0,.055,0],[[-20,25],[-35,35],[-15,15]],['抬头 / 低头','转头','侧倾'],true);
    ellipsoid(head,[0,.115,0],[.096,.132,.1]);
    ellipsoid(head,[0,.105,.098],[.022,.034,.022]);
    ellipsoid(head,[0,.066,.045],[.074,.057,.066]);
    for(const [prefix, name, sign] of [['left','左',1],['right','右',-1]] as const) {
      const shoulder = joint(`${prefix}Shoulder`,`${name}肩`,'上肢',chest.node,[sign*.235,.235,0],[[-170,45],[-75,75],sign>0?[0,170]:[-170,0]],['前举 / 后伸','内外旋','外展'],true,[0,0,sign*8]);
      ball(shoulder,.068); limb(shoulder,.285,.068,.048);
      const elbow = joint(`${prefix}Elbow`,`${name}肘`,'上肢',shoulder.node,[0,-.285,0],[[-145,0],[0,0],[0,0]],['屈肘','锁定','锁定']);
      ball(elbow,.047);
      const forearm = joint(`${prefix}Forearm`,`${name}前臂`,'上肢',elbow.node,[0,-.035,0],[[0,0],[-80,80],[0,0]],['锁定','旋前 / 旋后','锁定']);
      limb(forearm,.225,.048,.031);
      const wrist = joint(`${prefix}Wrist`,`${name}腕`,'上肢',forearm.node,[0,-.225,0],[[-65,65],[0,0],sign>0?[-20,30]:[-30,20]],['屈伸','锁定','桡偏 / 尺偏'],true);
      ball(wrist,.03); ellipsoid(wrist,[0,-.075,.007],[.043,.085,.025]);
      ellipsoid(wrist,[-sign*.043,-.048,.016],[.018,.043,.02]);
      const hip = joint(`${prefix}Hip`,`${name}髋`,'下肢',pelvis.node,[sign*.108,-.075,0],[[-120,25],sign>0?[-40,45]:[-45,40],sign>0?[-20,45]:[-45,20]],['抬腿 / 后伸','内外旋','外展 / 内收'],true);
      ball(hip,.079); limb(hip,.41,.087,.057);
      const knee = joint(`${prefix}Knee`,`${name}膝`,'下肢',hip.node,[0,-.41,0],[[0,140],[0,0],[0,0]],['屈膝','锁定','锁定']);
      ball(knee,.057); ellipsoid(knee,[0,0,.043],[.044,.052,.025]); limb(knee,.385,.059,.033);
      const ankle = joint(`${prefix}Ankle`,`${name}踝`,'下肢',knee.node,[0,-.385,0],[[-40,20],[0,0],[-15,15]],['跖屈 / 背屈','锁定','内外翻'],true);
      ball(ankle,.034); ellipsoid(ankle,[0,-.055,.065],[.055,.055,.115]);
    }
    this.reset();
  }
  get(id: string) { return this.joints.find(j=>j.id===id)!; }
  angles(j: Joint): Angles { return [j.node.rotation.x/D,j.node.rotation.y/D,j.node.rotation.z/D]; }
  set(j: Joint, values: number[]) { const a=constrainAngles(values,j.limits,j.coupled); j.node.rotation.set(a[0]*D,a[1]*D,a[2]*D,'XYZ'); }
  reset() { this.joints.forEach(j=>this.set(j,j.home)); }
  pose() { return Object.fromEntries(this.joints.map(j=>[j.id,this.angles(j)])); }
  restore(pose: Record<string, number[]>) { this.joints.forEach(j=>this.set(j,pose[j.id]??j.home)); }
  highlight(id: string|null) { this.joints.forEach(j=>j.meshes.forEach(m=>(m.material as T.MeshStandardMaterial).emissive.set(j.id===id?0x183d3b:0))); }
}
