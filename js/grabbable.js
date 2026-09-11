/**
 * grabbable.js
 * Système d'interaction de saisie (Grabbing) et de relâchement (Release)
 * Fonctionne en VR (contrôleurs Oculus Touch / Quest) et sur Desktop (souris/clic)
 */

if (AFRAME.components['vr-grabbable']) {
  delete AFRAME.components['vr-grabbable'];
}

AFRAME.registerComponent('vr-grabbable', {
  schema: {
    useGravity: { type: 'boolean', default: true },
    gravity: { type: 'number', default: -9.8 },
    bounce: { type: 'number', default: 0.35 },
    floorY: { type: 'number', default: 0.15 },
    tableY: { type: 'number', default: 0.89 },
    halfHeight: { type: 'number', default: 0.15 },
    gripRotation: { type: 'vec3', default: { x: -60, y: 0, z: 0 } }, // Décalage angulaire ergonomique en main (-60° par défaut, identique au pistolet)
    gripPosition: { type: 'vec3', default: { x: 0, y: 0, z: 0 } }    // Décalage de position en main
  },

  init: function () {
    this.el.classList.add('grabbable');
    this.isGrabbed = false;
    this.grabber = null;
    this.isResting = true; // Reste posé sur son support jusqu'à la première saisie

    this.velocity = new THREE.Vector3(0, 0, 0);
    this.prevPosition = new THREE.Vector3();
    this.el.object3D.getWorldPosition(this.prevPosition);

    // Vecteurs et quaternions réutilisables (0 allocation GC dans tick)
    this.targetPos = new THREE.Vector3();
    this.targetQuat = new THREE.Quaternion();
    this.currentPos = new THREE.Vector3();
    this.tempQuat = new THREE.Quaternion();
    this.tempOffset = new THREE.Vector3();

    this.updateGripTransform();
  },

  update: function () {
    this.updateGripTransform();
  },

  updateGripTransform: function () {
    const rot = this.data.gripRotation;
    if (rot && (rot.x !== 0 || rot.y !== 0 || rot.z !== 0)) {
      this.gripQuat = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(
          THREE.MathUtils.degToRad(rot.x),
          THREE.MathUtils.degToRad(rot.y),
          THREE.MathUtils.degToRad(rot.z),
          'YXZ'
        )
      );
    } else {
      this.gripQuat = null;
    }
  },

  onGrab: function (grabberEl) {
    this.isGrabbed = true;
    this.isResting = false;
    this.grabber = grabberEl;
    this.isAttracting = true;
    this.velocity.set(0, 0, 0);

    // Effet visuel lors de la prise en main (légère surbrillance)
    const mesh = this.el.getObject3D('mesh');
    if (mesh && mesh.material) {
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach(m => { if (m.emissive) m.emissive.setHex(0x222222); });
      } else if (mesh.material.emissive) {
        mesh.material.emissive.setHex(0x222222);
      }
    }

    this.el.emit('grabbed', { grabber: grabberEl });
  },

  onRelease: function (throwVelocity) {
    this.isGrabbed = false;
    this.grabber = null;

    // Rétablir le matériau
    const mesh = this.el.getObject3D('mesh');
    if (mesh && mesh.material) {
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach(m => { if (m.emissive) m.emissive.setHex(0x000000); });
      } else if (mesh.material.emissive) {
        mesh.material.emissive.setHex(0x000000);
      }
    }

    if (throwVelocity) {
      this.velocity.copy(throwVelocity);
    }

    this.el.emit('released', { velocity: this.velocity });
  },

  tick: function (time, timeDelta) {
    const dt = Math.min(timeDelta / 1000, 0.1);
    if (dt <= 0) return;

    if (this.isGrabbed && this.grabber) {
      const grabberObj = this.grabber.object3D;

      grabberObj.getWorldPosition(this.targetPos);
      grabberObj.getWorldQuaternion(this.targetQuat);

      const isDesktopHand = (this.grabber.id === 'desktop-virtual-hand');

      // En VR, appliquer l'orientation de prise en main ergonomique (-60° par défaut comme le pistolet)
      if (!isDesktopHand && this.gripQuat) {
        this.targetQuat.multiply(this.gripQuat);
      }

      // En VR, appliquer le décalage de position si spécifié
      if (!isDesktopHand && this.data.gripPosition && (this.data.gripPosition.x || this.data.gripPosition.y || this.data.gripPosition.z)) {
        this.tempOffset.set(
          this.data.gripPosition.x,
          this.data.gripPosition.y,
          this.data.gripPosition.z
        ).applyQuaternion(grabberObj.getWorldQuaternion(this.tempQuat));
        this.targetPos.add(this.tempOffset);
      }

      this.el.object3D.getWorldPosition(this.currentPos);
      this.velocity.subVectors(this.targetPos, this.currentPos).divideScalar(dt);

      // Si l'objet est en cours d'attraction vers la main (laser grab)
      if (this.isAttracting) {
        this.el.object3D.position.lerp(this.targetPos, Math.min(1.0, 20.0 * dt));
        this.el.object3D.quaternion.slerp(this.targetQuat, Math.min(1.0, 20.0 * dt));
        if (this.el.object3D.position.distanceTo(this.targetPos) < 0.05) {
          this.isAttracting = false;
          this.el.object3D.position.copy(this.targetPos);
          this.el.object3D.quaternion.copy(this.targetQuat);
        }
      } else {
        this.el.object3D.position.copy(this.targetPos);
        this.el.object3D.quaternion.copy(this.targetQuat);
      }
      return;
    }

    // Si l'objet est posé au repos initialement
    if (this.isResting) return;

    // Simulation de la physique et gravité
    if (!this.isGrabbed && this.data.useGravity) {
      this.velocity.y += this.data.gravity * dt;

      // Résistance de l'air
      this.velocity.x *= 0.98;
      this.velocity.z *= 0.98;

      const pos = this.el.object3D.position;
      pos.x += this.velocity.x * dt;
      pos.y += this.velocity.y * dt;
      pos.z += this.velocity.z * dt;

      // Détection de la surface de collision (Table ou Sol)
      let currentFloor = this.data.floorY;

      // Si l'objet se trouve au-dessus de la table (zone X: [-1.1, 1.1], Z: [-2.1, -0.9])
      const isOnTable = (pos.x >= -1.1 && pos.x <= 1.1 && pos.z >= -2.1 && pos.z <= -0.9);
      if (isOnTable && pos.y >= this.data.tableY) {
        currentFloor = this.data.tableY + this.data.halfHeight;
      }

      if (pos.y <= currentFloor) {
        pos.y = currentFloor;
        if (this.velocity.y < -0.8) {
          this.velocity.y = -this.velocity.y * this.data.bounce;
        } else {
          this.velocity.y = 0;
          this.velocity.x *= 0.8; // friction
          this.velocity.z *= 0.8;
          if (Math.abs(this.velocity.x) < 0.05 && Math.abs(this.velocity.z) < 0.05) {
            this.velocity.set(0, 0, 0);
          }
        }
      }
    }
  }
});

AFRAME.registerComponent('vr-grab-controls', {
  schema: {
    hand: { type: 'string', default: 'right' },
    grabRadius: { type: 'number', default: 1.2 }, // Portée directe de proximité (m)
    rayLength: { type: 'number', default: 6.0 },   // Longueur maximale du rayon laser (m)
    showLaser: { type: 'boolean', default: true },  // Faisceau laser visible
    rayAngle: { type: 'number', default: 60 }      // Inclinaison ergonomique du rayon (60° vers le bas, comme le pistolet)
  },

  init: function () {
    this.grabbedEl = null;
    this.targetedEl = null;
    this.isGripHeld = false;
    this.recentVelocities = [];
    this.lastWorldPos = new THREE.Vector3();
    this.el.object3D.getWorldPosition(this.lastWorldPos);

    this.raycaster = new THREE.Raycaster();
    this.rayOrigin = new THREE.Vector3();
    this.rayDir = new THREE.Vector3();
    this.controllerQuat = new THREE.Quaternion();
    this.rayQuat = new THREE.Quaternion();
    this.laserOffsetQuat = new THREE.Quaternion();
    this.myPos = new THREE.Vector3();
    this.targetObjPos = new THREE.Vector3();
    this.currentPos = new THREE.Vector3();
    this.instantVel = new THREE.Vector3();

    // Initialisation du rayon laser VR
    this.initLaser();

    this.onGripDown = this.onGripDown.bind(this);
    this.onGripUp = this.onGripUp.bind(this);
    this.onTriggerDown = this.onTriggerDown.bind(this);
    this.onTriggerUp = this.onTriggerUp.bind(this);

    this.el.addEventListener('gripdown', this.onGripDown);
    this.el.addEventListener('gripup', this.onGripUp);
    this.el.addEventListener('triggerdown', this.onTriggerDown);
    this.el.addEventListener('triggerup', this.onTriggerUp);
  },

  update: function (oldData) {
    if (this.laserGroup) {
      this.updateRayAngle();
    }
  },

  updateRayAngle: function () {
    const angleRad = THREE.MathUtils.degToRad(-this.data.rayAngle);
    this.laserOffsetQuat.setFromAxisAngle(new THREE.Vector3(1, 0, 0), angleRad);
    if (this.laserGroup) {
      this.laserGroup.rotation.x = angleRad;
    }
  },

  initLaser: function () {
    this.laserGroup = new THREE.Group();
    this.laserGroup.name = 'vr-grab-laser';

    // 1. Faisceau laser (cylindre fin orienté vers -Z)
    const beamLength = this.data.rayLength;
    const beamGeo = new THREE.CylinderGeometry(0.002, 0.0035, beamLength, 8);
    beamGeo.rotateX(Math.PI / 2);
    beamGeo.translate(0, 0, -beamLength / 2);

    this.laserMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.55
    });
    this.laserBeam = new THREE.Mesh(beamGeo, this.laserMat);
    this.laserGroup.add(this.laserBeam);

    // 2. Réticule / curseur lumineux au point d'impact
    const dotGeo = new THREE.SphereGeometry(0.016, 12, 12);
    this.dotMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.85
    });
    this.laserDot = new THREE.Mesh(dotGeo, this.dotMat);
    this.laserDot.position.set(0, 0, -beamLength);
    this.laserGroup.add(this.laserDot);

    // Appliquer l'inclinaison ergonomique au groupe laser
    this.updateRayAngle();

    this.el.object3D.add(this.laserGroup);
  },

  remove: function () {
    this.el.removeEventListener('gripdown', this.onGripDown);
    this.el.removeEventListener('gripup', this.onGripUp);
    this.el.removeEventListener('triggerdown', this.onTriggerDown);
    this.el.removeEventListener('triggerup', this.onTriggerUp);
    if (this.laserGroup && this.laserGroup.parent) {
      this.laserGroup.parent.remove(this.laserGroup);
    }
  },

  onGripDown: function () {
    this.isGripHeld = true;
    this.tryGrab();
  },

  onGripUp: function () {
    this.isGripHeld = false;
    this.release();
  },

  onTriggerDown: function () {
    if (this.grabbedEl) {
      this.grabbedEl.emit('actiondown', { hand: this.data.hand, controller: this.el });
    } else {
      // Main vide : la gâchette permet aussi d'attraper l'objet visé au laser
      this.tryGrab();
    }
  },

  onTriggerUp: function () {
    if (this.grabbedEl) {
      this.grabbedEl.emit('actionup', { hand: this.data.hand, controller: this.el });
    }
  },

  updateLaser: function () {
    if (this.grabbedEl || !this.data.showLaser) {
      this.laserGroup.visible = false;
      this.targetedEl = null;
      return;
    }

    this.laserGroup.visible = true;

    // Raycast depuis le contrôleur vers l'avant (-Z) avec l'inclinaison ergonomique (-60° comme le pistolet)
    this.el.object3D.getWorldPosition(this.rayOrigin);
    this.el.object3D.getWorldQuaternion(this.controllerQuat);
    this.rayQuat.copy(this.controllerQuat).multiply(this.laserOffsetQuat);
    this.rayDir.set(0, 0, -1).applyQuaternion(this.rayQuat).normalize();

    this.raycaster.set(this.rayOrigin, this.rayDir);
    this.raycaster.far = this.data.rayLength;

    // Récupérer les meshes des objets saisissables disponibles
    const grabbableMeshes = [];
    document.querySelectorAll('.grabbable').forEach(el => {
      const comp = el.components['vr-grabbable'];
      if (comp && comp.isGrabbed) return;
      const mesh = el.getObject3D('mesh');
      if (mesh) {
        mesh.userData.aframeEl = el;
        grabbableMeshes.push(mesh);
      }
    });

    const hits = this.raycaster.intersectObjects(grabbableMeshes, true);

    if (hits.length > 0) {
      let hitEl = hits[0].object.userData.aframeEl;
      let curr = hits[0].object;
      while (!hitEl && curr.parent) {
        curr = curr.parent;
        if (curr.userData && curr.userData.aframeEl) {
          hitEl = curr.userData.aframeEl;
        }
      }

      this.targetedEl = hitEl;
      const hitDist = hits[0].distance;

      // Adapter la longueur du faisceau à l'impact exact
      this.laserBeam.scale.set(1, 1, Math.max(0.05, hitDist / this.data.rayLength));
      this.laserDot.position.set(0, 0, -hitDist);

      // Passer en couleur verte / émeraude vif (objet verrouillé)
      this.laserMat.color.setHex(0x34d399);
      this.laserMat.opacity = 0.9;
      this.dotMat.color.setHex(0x34d399);
      this.laserDot.scale.set(1.4, 1.4, 1.4);
    } else {
      this.targetedEl = null;
      this.laserBeam.scale.set(1, 1, 1);
      this.laserDot.position.set(0, 0, -this.data.rayLength);

      // Couleur cyan repos
      this.laserMat.color.setHex(0x38bdf8);
      this.laserMat.opacity = 0.5;
      this.dotMat.color.setHex(0x38bdf8);
      this.laserDot.scale.set(1.0, 1.0, 1.0);
    }
  },

  tryGrab: function () {
    if (this.grabbedEl) return;

    let targetToGrab = null;

    // 1. Priorité à l'objet visé directement par le rayon laser
    if (this.targetedEl && this.targetedEl.components['vr-grabbable'] && !this.targetedEl.components['vr-grabbable'].isGrabbed) {
      targetToGrab = this.targetedEl;
    }

    // 2. Si aucun objet n'est sous le rayon, détection de proximité directe autour de la main
    if (!targetToGrab) {
      this.el.object3D.getWorldPosition(this.myPos);

      const grabbables = document.querySelectorAll('.grabbable');
      let minDist = this.data.grabRadius;

      grabbables.forEach(el => {
        const comp = el.components['vr-grabbable'];
        if (comp && comp.isGrabbed) return;
        el.object3D.getWorldPosition(this.targetObjPos);
        const dist = this.myPos.distanceTo(this.targetObjPos);
        if (dist < minDist) {
          minDist = dist;
          targetToGrab = el;
        }
      });
    }

    if (targetToGrab && targetToGrab.components['vr-grabbable']) {
      this.grabbedEl = targetToGrab;
      this.targetedEl = null;
      this.laserGroup.visible = false;
      targetToGrab.components['vr-grabbable'].onGrab(this.el);
    }
  },

  release: function () {
    if (!this.grabbedEl) return;

    const avgVelocity = new THREE.Vector3(0, 0, 0);
    if (this.recentVelocities.length > 0) {
      for (const v of this.recentVelocities) {
        avgVelocity.add(v);
      }
      avgVelocity.divideScalar(this.recentVelocities.length);
      avgVelocity.multiplyScalar(1.25);
    }

    if (this.grabbedEl.components['vr-grabbable']) {
      this.grabbedEl.components['vr-grabbable'].onRelease(avgVelocity);
    }
    this.grabbedEl = null;
    this.laserGroup.visible = true;
  },

  tick: function (time, timeDelta) {
    const dt = timeDelta / 1000;
    if (dt <= 0) return;

    // Mettre à jour le rayon laser interactif
    this.updateLaser();

    // Saisie continue si le grip est maintenu
    if (this.isGripHeld && !this.grabbedEl) {
      this.tryGrab();
    }

    this.el.object3D.getWorldPosition(this.currentPos);

    this.instantVel.subVectors(this.currentPos, this.lastWorldPos).divideScalar(dt);
    this.lastWorldPos.copy(this.currentPos);

    this.recentVelocities.push(this.instantVel.clone());
    if (this.recentVelocities.length > 5) {
      this.recentVelocities.shift();
    }
  }
});

AFRAME.registerComponent('desktop-grab-controls', {
  schema: {
    camera: { type: 'selector', default: '#camera' },
    holdDistance: { type: 'number', default: 2.0 }
  },

  init: function () {
    this.grabbedEl = null;
    this.throwVel = new THREE.Vector3();
    this.lastTargetPos = new THREE.Vector3();

    this.onMouseDown = this.onMouseDown.bind(this);
    this.onMouseUp = this.onMouseUp.bind(this);
    this.onKeyDown = this.onKeyDown.bind(this);

    window.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('keydown', this.onKeyDown);

    this.virtualHand = document.createElement('a-entity');
    this.virtualHand.setAttribute('id', 'desktop-virtual-hand');
    this.virtualHand.setAttribute('position', '0 -0.2 -1.8');
    if (this.data.camera) {
      this.data.camera.appendChild(this.virtualHand);
    }
  },

  remove: function () {
    window.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('keydown', this.onKeyDown);
    if (this.virtualHand && this.virtualHand.parentNode) {
      this.virtualHand.parentNode.removeChild(this.virtualHand);
    }
  },

  onMouseDown: function (evt) {
    if (evt.button !== 0) return;
    const sceneEl = document.querySelector('a-scene');
    if (sceneEl && sceneEl.is('vr-mode')) return;

    // Si on a déjà un objet saisi (ex: arme)
    if (this.grabbedEl) {
      this.grabbedEl.emit('actiondown', { hand: 'desktop', controller: this.virtualHand });
      return;
    }

    if (!this.data.camera || !this.data.camera.components.camera) return;
    const camera = this.data.camera.components.camera.camera;
    const raycaster = new THREE.Raycaster();

    // Raycast depuis la position exacte du clic de la souris
    const mouse = new THREE.Vector2(
      (evt.clientX / window.innerWidth) * 2 - 1,
      -(evt.clientY / window.innerHeight) * 2 + 1
    );
    raycaster.setFromCamera(mouse, camera);

    const grabbableObjects = [];
    document.querySelectorAll('.grabbable').forEach(el => {
      const mesh = el.getObject3D('mesh');
      if (mesh) {
        mesh.userData.aframeEl = el;
        grabbableObjects.push(mesh);
      }
    });

    const intersects = raycaster.intersectObjects(grabbableObjects, true);
    if (intersects.length > 0) {
      let hitEl = intersects[0].object.userData.aframeEl;
      let curr = intersects[0].object;
      while (!hitEl && curr.parent) {
        curr = curr.parent;
        if (curr.userData && curr.userData.aframeEl) {
          hitEl = curr.userData.aframeEl;
        }
      }

      if (hitEl && hitEl.components['vr-grabbable'] && !hitEl.components['vr-grabbable'].isGrabbed) {
        this.grabbedEl = hitEl;
        hitEl.components['vr-grabbable'].onGrab(this.virtualHand);
      }
    }
  },

  onMouseUp: function (evt) {
    if (evt.button !== 0) return;
    if (this.grabbedEl) {
      this.grabbedEl.emit('actionup', { hand: 'desktop', controller: this.virtualHand });
    }
  },

  onKeyDown: function (evt) {
    // Touche E ou G pour relâcher / jeter l'objet sur desktop
    if ((evt.key === 'e' || evt.key === 'E' || evt.key === 'g' || evt.key === 'G') && this.grabbedEl) {
      const cam = this.data.camera.components.camera.camera;
      const dir = new THREE.Vector3();
      cam.getWorldDirection(dir);
      const throwSpeed = 6.0;
      const throwV = dir.multiplyScalar(throwSpeed);
      throwV.y += 1.8;

      if (this.grabbedEl.components['vr-grabbable']) {
        this.grabbedEl.components['vr-grabbable'].onRelease(throwV);
      }
      this.grabbedEl = null;
    }
  },

  tick: function (time, timeDelta) {
    if (this.grabbedEl && this.virtualHand) {
      const dt = timeDelta / 1000;
      if (dt <= 0) return;
      const curPos = new THREE.Vector3();
      this.virtualHand.object3D.getWorldPosition(curPos);
      this.throwVel.subVectors(curPos, this.lastTargetPos).divideScalar(dt);
      this.lastTargetPos.copy(curPos);
    }
  }
});
