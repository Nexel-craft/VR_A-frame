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
    halfHeight: { type: 'number', default: 0.15 }
  },

  init: function () {
    this.el.classList.add('grabbable');
    this.isGrabbed = false;
    this.grabber = null;
    this.isResting = true; // Reste posé sur son support jusqu'à la première saisie

    this.velocity = new THREE.Vector3(0, 0, 0);
    this.prevPosition = new THREE.Vector3();
    this.el.object3D.getWorldPosition(this.prevPosition);
  },

  onGrab: function (grabberEl) {
    this.isGrabbed = true;
    this.isResting = false;
    this.grabber = grabberEl;
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
      const targetPos = new THREE.Vector3();
      const targetQuat = new THREE.Quaternion();

      grabberObj.getWorldPosition(targetPos);
      grabberObj.getWorldQuaternion(targetQuat);

      const currentPos = new THREE.Vector3();
      this.el.object3D.getWorldPosition(currentPos);
      this.velocity.subVectors(targetPos, currentPos).divideScalar(dt);

      this.el.object3D.position.copy(targetPos);
      this.el.object3D.quaternion.copy(targetQuat);
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
    grabRadius: { type: 'number', default: 0.35 }
  },

  init: function () {
    this.grabbedEl = null;
    this.recentVelocities = [];
    this.lastWorldPos = new THREE.Vector3();
    this.el.object3D.getWorldPosition(this.lastWorldPos);

    this.onGripDown = this.onGripDown.bind(this);
    this.onGripUp = this.onGripUp.bind(this);
    this.onTriggerDown = this.onTriggerDown.bind(this);
    this.onTriggerUp = this.onTriggerUp.bind(this);

    this.el.addEventListener('gripdown', this.onGripDown);
    this.el.addEventListener('gripup', this.onGripUp);
    this.el.addEventListener('triggerdown', this.onTriggerDown);
    this.el.addEventListener('triggerup', this.onTriggerUp);
  },

  remove: function () {
    this.el.removeEventListener('gripdown', this.onGripDown);
    this.el.removeEventListener('gripup', this.onGripUp);
    this.el.removeEventListener('triggerdown', this.onTriggerDown);
    this.el.removeEventListener('triggerup', this.onTriggerUp);
  },

  onGripDown: function () {
    this.tryGrab();
  },

  onGripUp: function () {
    this.release();
  },

  onTriggerDown: function () {
    if (this.grabbedEl) {
      this.grabbedEl.emit('actiondown', { hand: this.data.hand, controller: this.el });
    } else {
      this.tryGrab();
    }
  },

  onTriggerUp: function () {
    if (this.grabbedEl) {
      this.grabbedEl.emit('actionup', { hand: this.data.hand, controller: this.el });
    }
  },

  tryGrab: function () {
    if (this.grabbedEl) return;

    const myPos = new THREE.Vector3();
    this.el.object3D.getWorldPosition(myPos);

    const grabbables = document.querySelectorAll('.grabbable');
    let closestEl = null;
    let minDist = this.data.grabRadius;

    grabbables.forEach(el => {
      const comp = el.components['vr-grabbable'];
      if (comp && comp.isGrabbed) return;
      const targetPos = new THREE.Vector3();
      el.object3D.getWorldPosition(targetPos);
      const dist = myPos.distanceTo(targetPos);
      if (dist < minDist) {
        minDist = dist;
        closestEl = el;
      }
    });

    if (closestEl && closestEl.components['vr-grabbable']) {
      this.grabbedEl = closestEl;
      closestEl.components['vr-grabbable'].onGrab(this.el);
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
  },

  tick: function (time, timeDelta) {
    const dt = timeDelta / 1000;
    if (dt <= 0) return;

    const currentPos = new THREE.Vector3();
    this.el.object3D.getWorldPosition(currentPos);

    const instantVel = new THREE.Vector3().subVectors(currentPos, this.lastWorldPos).divideScalar(dt);
    this.lastWorldPos.copy(currentPos);

    this.recentVelocities.push(instantVel);
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
