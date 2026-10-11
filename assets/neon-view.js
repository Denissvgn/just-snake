// Dependency-injected, import-free view. Owns visuals only: no engine clock, RNG,
// input/store reference, renderer, animation loop or global event listener.
export function createNeonView({ THREE, grid, cell, bloomLayer, requestRender = () => {}, assetURLs = {} }) {
  if (!THREE || grid !== 21 || !Number.isFinite(cell) || cell <= 0) throw Error('Neon District requires the canonical 21-cell board');
  const board = grid * cell, half = board / 2, capacity = grid * grid, renderCapacity = capacity * 2;
  const scene = new THREE.Scene(); scene.name = 'Neon District'; scene.background = new THREE.Color(0x050a10);
  const camera = new THREE.OrthographicCamera(-half - cell, half + cell, half + cell, -half - cell, .1, 60 * cell);
  camera.position.set(0, 24 * cell, 0); camera.up.set(0, 0, -1); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(true);
  const geometries = [], materials = [], textures = [], ownedMeshes = [], decodedBytes = [0, 0], loaded = [false, false];
  const disposedTextures = new Set(); const transform = new THREE.Object3D();
  const positions = new Float32Array(capacity * 2), sides = [-1,1], hatchAngles = [-Math.PI/4,Math.PI/4];
  const palette = { amber: new THREE.Color(0xffa52b), pink: new THREE.Color(0xff397d), blue: new THREE.Color(0x5ea5ff), gold: new THREE.Color(0xffd76d) };
  let disposed = false, portrait = false, pulse = 1, perimeterDistance = 0, perimeterInitialized = false;
  let quality = 'low', reducedMotion = false, highContrast = false, colorblind = 'default';
  function disposeTexture(texture) { if (texture && !disposedTextures.has(texture)) { disposedTextures.add(texture); texture.dispose(); } }
  function dispose() {
    if (disposed) return; disposed = true;
    for (const mesh of ownedMeshes) if (mesh.isInstancedMesh) mesh.dispose();
    scene.clear();
    for (const value of geometries) value.dispose();
    for (const value of materials) value.dispose();
    for (const value of textures) disposeTexture(value);
  }
  try {
  const geometry = value => { geometries.push(value); return value; };
  const material = value => { materials.push(value); return value; };
  function clip(material) {
    material.onBeforeCompile = shader => {
      shader.vertexShader = 'varying vec2 vNeonXZ;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
        vec4 neonPosition = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          neonPosition = instanceMatrix * neonPosition;
        #endif
        vNeonXZ = (modelMatrix * neonPosition).xz;`);
      shader.fragmentShader = 'varying vec2 vNeonXZ;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('void main() {', `void main() {
        if (abs(vNeonXZ.x) > ${half.toFixed(8)} || abs(vNeonXZ.y) > ${half.toFixed(8)}) discard;`);
    };
    material.customProgramCacheKey = () => 'neon-board-clip-' + board;
    return material;
  }
  const box = geometry(new THREE.BoxGeometry(1, 1, 1)), plane = geometry(new THREE.PlaneGeometry(1, 1));
  const steel = material(new THREE.MeshBasicMaterial({ color: 0x17262d }));
  const amber = material(clip(new THREE.MeshBasicMaterial({ color: palette.amber })));
  const interior = material(clip(new THREE.MeshBasicMaterial({ color: 0x100c08 })));
  const core = material(clip(new THREE.MeshBasicMaterial({ color: 0xfff0be, side: THREE.DoubleSide })));
  const foodMaterial = material(clip(new THREE.MeshBasicMaterial({ color: 0xffffff })));
  const hatchMaterial = material(new THREE.MeshBasicMaterial({ color: 0x37e5f3 }));
  const cityMaterial = material(new THREE.MeshBasicMaterial({ color: 0x708392 }));
  const glassMaterial = material(new THREE.MeshBasicMaterial({ color: 0x050a10, transparent: true, opacity: .70, depthWrite: false }));
  const gridMaterial = material(new THREE.LineBasicMaterial({ color: 0x156274, transparent: true, opacity: .65 }));
  const frameMaterial = material(new THREE.LineBasicMaterial({ color: 0x37e5f3 }));
  function add(mesh, name, luminous = false) {
    mesh.name = name; mesh.frustumCulled = false;
    if (luminous) mesh.layers.enable(bloomLayer);
    scene.add(mesh); ownedMeshes.push(mesh); return mesh;
  }
  function instances(geo, mat, count, name, luminous = false) {
    const mesh = add(new THREE.InstancedMesh(geo, mat, count), name, luminous);
    mesh.count = 0; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); return mesh;
  }
  function place(mesh, index, x, y, z, width, height, depth, yaw = 0) {
    transform.position.set(x, y, z); transform.rotation.set(0, yaw, 0); transform.scale.set(width, height, depth);
    transform.updateMatrix(); mesh.setMatrixAt(index, transform.matrix);
  }
  const city = add(new THREE.Mesh(plane, cityMaterial), 'Wet city');
  city.rotation.x = -Math.PI / 2; city.position.y = -.12 * cell; city.scale.set(board, board, 1);
  const glass = add(new THREE.Mesh(plane, glassMaterial), 'Dark arena glass');
  glass.rotation.x = -Math.PI / 2; glass.position.y = -.08 * cell; glass.scale.set(board, board, 1); glass.renderOrder = 1;
  const gridPositions = [];
  for (let i = 0; i <= grid; i++) {
    const p = -half + i * cell;
    gridPositions.push(p, .005 * cell, -half, p, .005 * cell, half, -half, .005 * cell, p, half, .005 * cell, p);
  }
  const gridGeo = geometry(new THREE.BufferGeometry()); gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(gridPositions, 3));
  add(new THREE.LineSegments(gridGeo, gridMaterial), '21 by 21 grid');
  const corners = radius => [[-radius+.38*cell,-radius],[radius-.38*cell,-radius],[radius,-radius+.38*cell],[radius,radius-.38*cell],[radius-.38*cell,radius],[-radius+.38*cell,radius],[-radius,radius-.38*cell],[-radius,-radius+.38*cell]];
  const outer = corners(half + .65 * cell), inner = corners(half + .14 * cell), shape = new THREE.Shape();
  outer.forEach(([x,z], i) => i ? shape.lineTo(x,z) : shape.moveTo(x,z)); shape.closePath();
  const hole = new THREE.Path(); inner.slice().reverse().forEach(([x,z], i) => i ? hole.lineTo(x,z) : hole.moveTo(x,z)); hole.closePath(); shape.holes.push(hole);
  const frame = add(new THREE.Mesh(geometry(new THREE.ShapeGeometry(shape)), steel), 'Chamfered steel surround'); frame.rotation.x = -Math.PI / 2; frame.position.y = -.03 * cell;
  const edgePositions = [];
  inner.forEach(([x,z], i) => { const [nextX,nextZ] = inner[(i+1)%inner.length]; edgePositions.push(x,.03*cell,z,nextX,.03*cell,nextZ); });
  const edgeGeo = geometry(new THREE.BufferGeometry()); edgeGeo.setAttribute('position', new THREE.Float32BufferAttribute(edgePositions, 3));
  add(new THREE.LineSegments(edgeGeo, frameMaterial), 'Cyan arena perimeter', true);
  const body = instances(box, amber, renderCapacity, 'Amber segment outlines', true);
  const insets = instances(box, interior, renderCapacity, 'Dark segment plates');
  const connectors = instances(box, amber, renderCapacity, 'Short cell connectors', true);
  const eyes = instances(box, core, 4, 'Two head eyes', true);
  const arrowGeo = geometry(new THREE.BufferGeometry());
  arrowGeo.setAttribute('position', new THREE.Float32BufferAttribute([-.1,0,-.09, -.1,0,.09, .18,0,0], 3));
  const directions = instances(arrowGeo, core, 2, 'Head direction', true);
  const foodBlocks = instances(box, foodMaterial, 2, 'Actual food slots', true);
  foodBlocks.setColorAt(0, palette.pink); foodBlocks.setColorAt(1, palette.pink); foodBlocks.instanceColor.setUsage(THREE.DynamicDrawUsage);
  const foodInsets = instances(box, interior, 2, 'Food dark insets');
  const foodMarks = instances(box, core, 16, 'Food type markings', true);
  const pillars = instances(box, steel, 5, 'Actual pillar blocks');
  const hatches = instances(box, hatchMaterial, 24, 'Pillar crosses and wrap arrows');
  const beam = add(new THREE.Mesh(box, amber), 'Existing sweeping perimeter light', true); beam.visible = false;
  const dynamicMeshes = [body,insets,connectors,eyes,directions,foodBlocks,foodInsets,foodMarks,pillars,hatches];
  const world = index => (index - grid / 2 + .5) * cell;
  function seamOffset(x,z) {
    if (x < -half + .42 * cell) return 1;
    if (x > half - .42 * cell) return -1;
    if (z < -half + .42 * cell) return 2;
    if (z > half - .42 * cell) return -2;
    return 0;
  }
  function offsetX(seam) { return Math.abs(seam) === 1 ? seam * board : 0; }
  function offsetZ(seam) { return Math.abs(seam) === 2 ? seam / 2 * board : 0; }
  function selectedTexture() {
    const index = portrait ? 1 : 0, texture = loaded[index] ? textures[index] : null;
    if (cityMaterial.map !== texture) { cityMaterial.map = texture; cityMaterial.needsUpdate = true; }
  }
  for (const [index,key] of ['wide','portrait'].entries()) {
    const url = assetURLs[key]; if (!url) continue;
    try {
      textures[index] = new THREE.TextureLoader().load(url, texture => {
        if (disposed) { disposeTexture(texture); return; }
        const bytes = (texture.image?.width || 0) * (texture.image?.height || 0) * 4;
        if (!bytes || bytes + decodedBytes[1-index] > 16 * 1024 * 1024) { disposeTexture(texture); return; }
        decodedBytes[index] = bytes; loaded[index] = true;
        texture.colorSpace = THREE.SRGBColorSpace; texture.generateMipmaps = false;
        texture.minFilter = THREE.LinearFilter; texture.magFilter = THREE.LinearFilter;
        // Crop the local plate to a square; never stretch its city architecture.
        const aspect = texture.image.width / texture.image.height;
        texture.repeat.set(aspect > 1 ? 1/aspect : 1, aspect < 1 ? aspect : 1);
        texture.offset.set((1-texture.repeat.x)/2, (1-texture.repeat.y)/2);
        texture.needsUpdate = true; selectedTexture(); requestRender();
      }, undefined, () => { if (!disposed) requestRender(); });
    } catch { /* Optional art failure retains the matte board. */ }
  }
  function setPresentationOptions(options = {}) {
    const nextQuality = options.quality || 'low', nextMotion = Boolean(options.reducedMotion), nextContrast = Boolean(options.highContrast), nextColor = options.colorblind || 'default';
    if (nextQuality === quality && nextMotion === reducedMotion && nextContrast === highContrast && nextColor === colorblind) return;
    quality = nextQuality; reducedMotion = nextMotion; highContrast = nextContrast; colorblind = nextColor;
    city.visible = !highContrast;
    glassMaterial.opacity = highContrast ? .86 : .70;
    gridMaterial.color.setHex(highContrast ? 0x65909c : 0x156274); gridMaterial.opacity = highContrast ? .9 : .65;
    interior.color.setHex(highContrast ? 0x030406 : 0x100c08);
    core.color.setHex(highContrast ? 0xffffff : 0xfff0be);
    frameMaterial.color.setHex(highContrast ? 0x8cf5ff : 0x37e5f3);
  }
  function resize(width,height) {
    if (disposed) return;
    const aspect = Math.max(1,width)/Math.max(1,height), radius = half + cell;
    camera.left = -radius * Math.max(1,aspect); camera.right = -camera.left;
    camera.top = radius * Math.max(1,1/aspect); camera.bottom = -camera.top;
    camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
    portrait = width < 600; selectedTexture();
  }
  function sync(frame) {
    if (disposed) return;
    const count = Math.max(0, Math.min(capacity, frame.segmentCount | 0)), ratio = Math.max(0,Math.min(1,frame.interpolation));
    let drawn = 0, linked = 0, eyeCount = 0, directionCount = 0;
    for (let i = 0; i < count; i++) {
      const at = i*4, x = frame.segments[at], z = frame.segments[at+1];
      let px = frame.segments[at+2], pz = frame.segments[at+3];
      if (frame.wrap) {
        if (x-px < -grid/2) px -= grid; else if (x-px > grid/2) px += grid;
        if (z-pz < -grid/2) pz -= grid; else if (z-pz > grid/2) pz += grid;
      }
      const wx = world(px + (x-px)*ratio), wz = world(pz + (z-pz)*ratio);
      positions[i*2] = wx; positions[i*2+1] = wz;
      const seam = frame.wrap ? seamOffset(wx,wz) : 0;
      for (let copy = 0; copy < (seam ? 2 : 1); copy++) {
        const cx = wx + (copy ? offsetX(seam) : 0), cz = wz + (copy ? offsetZ(seam) : 0);
        place(body,drawn,cx,.20*cell,cz,.84*cell,.28*cell,.84*cell);
        place(insets,drawn,cx,.36*cell,cz,.64*cell,.05*cell,.64*cell);drawn++;
        if (i===0) {
          const dx=frame.direction.x,dz=frame.direction.z;
          for(const side of sides)place(eyes,eyeCount++,cx+(dx*.18-dz*side*.15)*cell,.405*cell,cz+(dz*.18+dx*side*.15)*cell,.08*cell,.06*cell,.08*cell);
          place(directions,directionCount++,cx-dx*.13*cell,.405*cell,cz-dz*.13*cell,cell,cell,cell,-Math.atan2(dz,dx));
        }
      }
      if (i>0) {
        let ax=positions[(i-1)*2],az=positions[(i-1)*2+1];
        if(frame.wrap){if(ax-wx>half)ax-=board;else if(ax-wx < -half)ax+=board;if(az-wz>half)az-=board;else if(az-wz < -half)az+=board;}
        const dx=ax-wx,dz=az-wz,distance=Math.hypot(dx,dz);
        if(distance>.05*cell&&distance<1.45*cell){const x=(ax+wx)/2,z=(az+wz)/2,seam=frame.wrap?seamOffset(x,z):0;
          for(let copy=0;copy<(seam?2:1);copy++)place(connectors,linked++,x+(copy?offsetX(seam):0),.16*cell,z+(copy?offsetZ(seam):0),Math.max(.08*cell,distance-.55*cell),.13*cell,.12*cell,-Math.atan2(dz,dx));}
      }
    }
    body.count=insets.count=drawn;connectors.count=linked;eyes.count=eyeCount;directions.count=directionCount;
    const freezeCosmetics = Boolean(frame.suspended || frame.screen==='paused' || frame.screen==='summary' || quality==='low' || reducedMotion);
    if(frame.screen==='playing'&&!freezeCosmetics)pulse=1+Math.sin(frame.elapsed*Math.PI/2)*.035;
    if(reducedMotion||quality==='low')pulse=1;
    let foods=0,marks=0;
    for(let i=0;i<2;i++){
      const food=frame.foods[i];if(!food?.active)continue;
      let x=world(food.x),z=world(food.z);
      if(food.isHopping){const t=Math.max(0,Math.min(1,food.hopProgress));x=food.hopStartX+(food.hopTargetX-food.hopStartX)*t;z=food.hopStartZ+(food.hopTargetZ-food.hopStartZ)*t;}
      const golden=food.type==='golden',jittery=food.type==='jittery',color=golden?palette.gold:colorblind==='colorblind'?palette.blue:palette.pink;
      place(foodBlocks,foods,x,.25*cell,z,.75*cell*pulse,.30*cell,.75*cell*pulse);
      place(foodInsets,foods,x,.42*cell,z,.56*cell,.05*cell,.56*cell);foodBlocks.setColorAt(foods,color);foods++;
      if(golden){for(let edge=0;edge<4;edge++){const a=Math.PI/4+edge*Math.PI/2;place(foodMarks,marks++,x+Math.cos(a)*.14*cell,.46*cell,z+Math.sin(a)*.14*cell,.26*cell,.045*cell,.045*cell,-a+Math.PI/2);}place(foodMarks,marks++,x,.46*cell,z,.07*cell,.045*cell,.35*cell);const remaining=food.maxTimer>0?Math.max(0,Math.min(1,food.timer/food.maxTimer)):1;place(foodMarks,marks++,x-(1-remaining)*.22*cell,.46*cell,z+.25*cell,Math.max(.025,remaining*.44)*cell,.035*cell,.045*cell);}
      else if(jittery){for(let arrow=0;arrow<2;arrow++)for(const side of sides)place(foodMarks,marks++,x+(arrow-.5)*.22*cell,.46*cell,z+side*.075*cell,.19*cell,.045*cell,.055*cell,side*Math.PI/4);}
      else place(foodMarks,marks++,x,.46*cell,z,.24*cell,.05*cell,.24*cell);
    }
    foodBlocks.count=foodInsets.count=foods;foodMarks.count=marks;foodBlocks.instanceColor.needsUpdate=true;
    pillars.count=Math.max(0,Math.min(5,frame.pillarCount|0));let hatchCount=0;
    for(let i=0;i<pillars.count;i++){const x=world(frame.pillars[i*2]),z=world(frame.pillars[i*2+1]);place(pillars,i,x,.23*cell,z,.82*cell,.45*cell,.82*cell);for(const yaw of hatchAngles)place(hatches,hatchCount++,x,.48*cell,z,.84*cell,.035*cell,.055*cell,yaw);}
    if(frame.wrap){for(let edge=0;edge<4;edge++){const a=edge*Math.PI/2,x=Math.cos(a)*(half+.37*cell),z=Math.sin(a)*(half+.37*cell);for(const side of sides)place(hatches,hatchCount++,x+Math.cos(a+Math.PI/2)*side*.09*cell,.05*cell,z+Math.sin(a+Math.PI/2)*side*.09*cell,.22*cell,.04*cell,.05*cell,-a+side*Math.PI/4);}}
    hatches.count=hatchCount;beam.visible=Boolean(frame.perimeterActive);
    if (!perimeterInitialized || !freezeCosmetics) { perimeterDistance = frame.perimeterPosition; perimeterInitialized = true; }
    if(beam.visible){const distance=((perimeterDistance% (board*4))+board*4)%(board*4),edge=Math.floor(distance/board),t=distance%board;let x,z;
      if(edge===0){x=-half+t;z=-half;}else if(edge===1){x=half;z=-half+t;}else if(edge===2){x=half-t;z=half;}else{x=-half;z=half-t;}
      beam.position.set(x,.09*cell,z);beam.rotation.y=edge%2?Math.PI/2:0;beam.scale.set(1.8*cell,.05*cell,.12*cell);
    }
    for(const mesh of dynamicMeshes)mesh.instanceMatrix.needsUpdate=true;
  }
  return { scene, camera, sync, resize, setPresentationOptions, dispose };
  } catch (error) { dispose(); throw error; }
}
