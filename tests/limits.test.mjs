import {test} from 'node:test';
import assert from 'node:assert/strict';
import {constrainAngles} from '../src/limits.mjs';
test('elbows cannot bend backward or twist',()=>{assert.deepEqual(constrainAngles([50,90,90],[[-145,0],[0,0],[0,0]]),[0,0,0]);assert.deepEqual(constrainAngles([-200,0,0],[[-145,0],[0,0],[0,0]]),[-145,0,0]);});
test('knees only flex in the correct direction',()=>{assert.deepEqual(constrainAngles([-90,20,-10],[[0,140],[0,0],[0,0]]),[0,0,0]);assert.equal(constrainAngles([180,0,0],[[0,140],[0,0],[0,0]])[0],140);});
test('coupled shoulder extremes are reduced while single-axis reach stays available',()=>{const limits=[[-170,45],[-75,75],[0,170]];assert.deepEqual(constrainAngles([-170,0,0],limits,true),[-170,0,0]);const a=constrainAngles([-170,75,170],limits,true);const energy=(a[0]/170)**2+(a[1]/75)**2+(a[2]/170)**2;assert.ok(energy<=1.000001);});
test('mirrored hips preserve a mirrored valid motion envelope',()=>{const left=[[-120,25],[-40,45],[-20,45]],right=[[-120,25],[-45,40],[-45,20]];const a=constrainAngles([-100,30,35],left,true);const b=constrainAngles([-100,-30,-35],right,true);assert.deepEqual(b,[a[0],-a[1],-a[2]]);});
test('invalid input cannot inject nonfinite rotations',()=>{assert.deepEqual(constrainAngles([NaN,Infinity,-Infinity],[[-10,10],[-10,10],[-10,10]]),[0,0,0]);});
