const T=globalThis.THREE,stage=document.querySelector('#stage'),statusEl=document.querySelector('#status');
const gameUrl=new URL('/api/disc/boot.html',location.href).href;
const assets=globalThis.__siteAssets;
if(!assets||!assets.model||!assets.png)throw new Error('site.bin was not unpacked');
const MODEL_URL=assets.model;

const renderer=new T.WebGLRenderer({antialias:true,alpha:true});
renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.75));
renderer.outputEncoding=T.sRGBEncoding;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
stage.appendChild(renderer.domElement);

const scene=new T.Scene(),camera=new T.PerspectiveCamera(32,1,.1,120);
scene.add(new T.HemisphereLight(0xdce9ff,0x1d231d,.9));
const key=new T.DirectionalLight(0xffffff,1.05);key.position.set(4.5,9,6.5);key.castShadow=true;key.shadow.mapSize.set(2048,2048);Object.assign(key.shadow.camera,{left:-7,right:7,top:7,bottom:-7,near:1,far:34});key.shadow.bias=-.0008;scene.add(key);
const rim=new T.DirectionalLight(0x93b9ff,.55);rim.position.set(-7,3.5,-5);scene.add(rim);
const floor=new T.Mesh(new T.PlaneGeometry(80,80),new T.ShadowMaterial({opacity:.36}));floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;scene.add(floor);

/* console geometry, in scene units. The model is scaled uniformly so its width is CONSOLE_WIDTH,
   then centred on the origin with its underside on the floor. */
const CONSOLE_WIDTH=3.3;
let front=1.285,modelHeight=.712,modelDepth=2.57,slotX=-.86,slotY=.394,modelReady=false;
/* the model's own disc slot (front face, left half) in model units, measured from the GLB */
const SLOT={x:-.9275,y:-.27,z:1.09,width:1.775};

const slotBar=new T.Mesh(new T.BoxGeometry(1,1,1),new T.MeshStandardMaterial({color:0x0a1114,roughness:.5,metalness:.3,emissive:0x000000}));
slotBar.scale.set(SLOT.width*CONSOLE_WIDTH/3.567,.014,.03);
slotBar.position.set(slotX,slotY,front-.005);
scene.add(slotBar);

/* disc */
const R=.66;
const discTex=new T.TextureLoader().load(assets.png);
discTex.encoding=T.sRGBEncoding;
discTex.anisotropy=renderer.capabilities.getMaxAnisotropy();
const disc=new T.Group();
const discTop=new T.Mesh(new T.RingGeometry(R*.17,R,96),new T.MeshStandardMaterial({map:discTex,transparent:true,alphaTest:.05,roughness:.38,metalness:.12,side:T.DoubleSide}));
const discUnder=new T.Mesh(new T.RingGeometry(R*.17,R,96),new T.MeshStandardMaterial({color:0xd7dde2,roughness:.26,metalness:.85,side:T.DoubleSide}));
const discEdge=new T.Mesh(new T.CylinderGeometry(R,R,.016,96,1,true),new T.MeshStandardMaterial({color:0xc4cbd0,roughness:.3,metalness:.8}));
discTop.rotation.x=discUnder.rotation.x=-Math.PI/2;
discTop.position.y=.009;discEdge.position.y=.004;
disc.add(discTop,discUnder,discEdge);
disc.traverse(o=>{if(o.isMesh)o.castShadow=true});
scene.add(disc);

const REST={x:.55,z:front+.9};
const state={mode:'rest',tx:REST.x,tz:REST.z,restY:.012,fired:false,at:0};
disc.position.set(REST.x,state.restY,REST.z);

/* ---- model ---- */
const loader=new T.GLTFLoader();
loader.load(MODEL_URL,gltf=>{
  const model=gltf.scene;
  model.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true}});
  const box=new T.Box3().setFromObject(model),size=box.getSize(new T.Vector3()),center=box.getCenter(new T.Vector3());
  const k=CONSOLE_WIDTH/size.x;
  model.scale.setScalar(k);
  model.position.set(-center.x*k,-box.min.y*k,-center.z*k);
  scene.add(model);
  front=size.z*k/2;modelHeight=size.y*k;modelDepth=size.z*k;
  slotX=(SLOT.x-center.x)*k;
  slotY=(SLOT.y-box.min.y)*k;
  slotBar.scale.set(SLOT.width*k,.014,.03);
  slotBar.position.set(slotX,slotY,front-.005);
  REST.z=front+.9;
  state.tx=REST.x;state.tz=REST.z;
  disc.position.set(REST.x,state.restY,REST.z);
  updateFitBox();
  modelReady=true;
  statusEl.textContent='Disc on the table';
},undefined,error=>{console.error('Xbox model failed to load',error);statusEl.textContent='Could not load the console model'});

/* ---- framing: fit the console plus the disc into any viewport ---- */
const fitBox=new T.Box3(),target=new T.Vector3();
function updateFitBox(){
  fitBox.min.set(-CONSOLE_WIDTH/2,0,-front);
  fitBox.max.set(CONSOLE_WIDTH/2,modelHeight,Math.max(front+.2,REST.z+R));
}
updateFitBox();
const cam={theta:.52,phi:.42,zoom:1};
const UP=new T.Vector3(0,1,0),corner=new T.Vector3(),dir=new T.Vector3(),fwd=new T.Vector3(),right=new T.Vector3(),camUp=new T.Vector3();
function camDir(){
  return dir.set(Math.cos(cam.phi)*Math.sin(cam.theta),Math.sin(cam.phi),Math.cos(cam.phi)*Math.cos(cam.theta));
}
function fitDistance(){
  camDir();
  fwd.copy(dir).negate();
  right.crossVectors(fwd,UP).normalize();
  camUp.crossVectors(right,fwd).normalize();
  const tanV=Math.tan(T.MathUtils.degToRad(camera.fov)/2),tanH=tanV*camera.aspect;
  fitBox.getCenter(target);
  let d=0;
  for(let i=0;i<8;i++){
    corner.set(i&1?fitBox.max.x:fitBox.min.x,i&2?fitBox.max.y:fitBox.min.y,i&4?fitBox.max.z:fitBox.min.z).sub(target);
    const c=corner.dot(fwd);
    d=Math.max(d,Math.abs(corner.dot(right))/tanH-c,Math.abs(corner.dot(camUp))/tanV-c);
  }
  return d*1.05;
}
let radius=8;
function resize(){
  const w=Math.max(1,stage.clientWidth),h=Math.max(1,stage.clientHeight);
  renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();
}
addEventListener('resize',resize);resize();

/* ---- pointer input ---- */
const ray=new T.Raycaster(),mouse=new T.Vector2(),dragPlane=new T.Plane(new T.Vector3(0,1,0),-slotY),pt=new T.Vector3(),el=renderer.domElement;
function setRay(e){
  const b=el.getBoundingClientRect();mouse.set((e.clientX-b.left)/b.width*2-1,-(e.clientY-b.top)/b.height*2+1);
  camera.updateMatrixWorld();disc.updateMatrixWorld(true);
  ray.setFromCamera(mouse,camera);
}
function pickDisc(){return disc.visible&&(state.mode==='rest'||state.mode==='drag')&&ray.intersectObjects([discTop,discUnder,discEdge],false).length>0}
function planePt(){return ray.ray.intersectPlane(dragPlane,pt)?pt:null}
function aligned(x){return Math.abs(x-slotX)<.45}
function setTarget(x,z){
  if(aligned(x))z=Math.max(z,front-.12);
  else if(Math.abs(x)<CONSOLE_WIDTH/2+.7&&z<front+.75&&z>-front-.75)z=front+.75;
  state.tx=T.MathUtils.clamp(x,-8,8);
  state.tz=T.MathUtils.clamp(z,-front-3.5,front+5);
}
let input=null,drag=null;
function launch(){
  // the isolated app has to be its own document to receive the COOP/COEP headers,
  // so it replaces this page in the current tab
  statusEl.textContent='Launching game…';
  location.replace(gameUrl);
}
el.addEventListener('pointerdown',e=>{
  setRay(e);el.setPointerCapture(e.pointerId);
  if(pickDisc()){
    // carried under the cursor at slot height, so what you see is where it drops
    input='disc';dragPlane.constant=-slotY;
    state.mode='drag';state.fired=false;
    statusEl.textContent='Dragging disc';el.style.cursor='grabbing';
  }else{input='orbit';drag={x:e.clientX,y:e.clientY}}
});
el.addEventListener('pointermove',e=>{
  setRay(e);
  if(input==='disc'){const p=planePt();if(p)setTarget(p.x,p.z)}
  else if(input==='orbit'&&drag){
    cam.theta-=(e.clientX-drag.x)*.007;cam.phi=T.MathUtils.clamp(cam.phi+(e.clientY-drag.y)*.006,.06,1.35);
    drag.x=e.clientX;drag.y=e.clientY;
  }else el.style.cursor=pickDisc()?'pointer':'grab';
});
el.addEventListener('pointerup',()=>{
  if(input==='disc'){
    el.style.cursor='grab';
    if(modelReady&&aligned(state.tx)&&state.tz<=front+.4){
      state.mode='inserting';statusEl.textContent='Inserting disc';
    }else{
      state.mode='rest';state.restY=.012;statusEl.textContent='Disc on the table';
    }
  }
  input=null;drag=null;
});
el.addEventListener('pointercancel',()=>{
  if(input==='disc'){state.mode='rest';state.restY=.012;statusEl.textContent='Disc on the table'}
  input=null;drag=null;
});
el.addEventListener('wheel',e=>{e.preventDefault();cam.zoom=T.MathUtils.clamp(cam.zoom*(1+e.deltaY*.0012),.55,2.4)},{passive:false});

/* ---- loop ---- */
const insideZ=()=>front-.7;
function frame(){
  const want=fitDistance()*cam.zoom;
  radius+=(want-radius)*.14;
  camera.position.copy(target).addScaledVector(camDir(),radius);
  camera.lookAt(target);
  const p=disc.position;
  if(state.mode==='drag'){
    p.x+=(state.tx-p.x)*.4;p.z+=(state.tz-p.z)*.4;p.y+=(slotY-p.y)*.25;
  }else if(state.mode==='rest'){
    p.x+=(state.tx-p.x)*.3;p.z+=(state.tz-p.z)*.3;p.y+=(state.restY-p.y)*.2;
  }else if(state.mode==='inserting'){
    p.x+=(slotX-p.x)*.22;p.y+=(slotY-p.y)*.3;p.z+=(insideZ()-p.z)*.14;
    if(Math.abs(p.z-insideZ())<.03&&Math.abs(p.x-slotX)<.01){
      state.mode='inside';disc.visible=false;state.at=performance.now();state.fired=false;statusEl.textContent='Disc inside';
    }
  }else if(state.mode==='inside'&&!state.fired&&performance.now()-state.at>=3000){
    state.fired=true;launch();
  }
  slotBar.material.emissive.setHex(state.mode==='drag'&&aligned(state.tx)&&state.tz<=front+.4?0x1f7a45:0x000000);
  renderer.render(scene,camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
