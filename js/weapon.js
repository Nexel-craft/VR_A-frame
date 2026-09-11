/**
 * weapon.js
 * Modèle 3D procédural d'arme à feu VR, ergonomie de prise en main,
 * et système balistique physique de tir de projectiles avec vitesse et gravité ajustables.
 */

// Composant de génération du modèle 3D de l'arme
AFRAME.registerComponent('gun-model', {
  init: function () {
    const gunGroup = new THREE.Group();

    // Matériaux modernes métalliques
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x22252a,
      metalness: 0.85,
      roughness: 0.3
    });

    const gripMat = new THREE.MeshStandardMaterial({
      color: 0x111215,
      roughness: 0.8
    });

    const barrelMat = new THREE.MeshStandardMaterial({
      color: 0x151618,
      metalness: 0.95,
      roughness: 0.2
    });

    const sightMat = new THREE.MeshStandardMaterial({
      color: 0x00ff88,
      emissive: 0x00ff88,
      emissiveIntensity: 0.8
    });

    // 1. Culasse / Slide (Haut de l'arme)
    const slideGeo = new THREE.BoxGeometry(0.045, 0.05, 0.22);
    const slide = new THREE.Mesh(slideGeo, bodyMat);
    slide.position.set(0, 0.04, -0.06);
    slide.castShadow = true;
    slide.receiveShadow = true;
    gunGroup.add(slide);

    // 2. Canon (Barrel)
    const barrelGeo = new THREE.CylinderGeometry(0.014, 0.014, 0.22, 16);
    barrelGeo.rotateX(Math.PI / 2);
    const barrel = new THREE.Mesh(barrelGeo, barrelMat);
    barrel.position.set(0, 0.04, -0.065);
    gunGroup.add(barrel);

    // 3. Poignée ergonomique (Grip) inclinée
    const gripGeo = new THREE.BoxGeometry(0.04, 0.12, 0.06);
    const grip = new THREE.Mesh(gripGeo, gripMat);
    grip.position.set(0, -0.035, 0.02);
    grip.rotation.x = THREE.MathUtils.degToRad(15);
    grip.castShadow = true;
    gunGroup.add(grip);

    // 4. Pontet (Trigger guard)
    const guardGeo = new THREE.BoxGeometry(0.015, 0.04, 0.055);
    const guard = new THREE.Mesh(guardGeo, bodyMat);
    guard.position.set(0, 0.0, -0.02);
    gunGroup.add(guard);

    // 5. Gâchette (Trigger)
    const triggerGeo = new THREE.BoxGeometry(0.01, 0.025, 0.012);
    const trigger = new THREE.Mesh(triggerGeo, bodyMat);
    trigger.position.set(0, 0.005, -0.015);
    trigger.rotation.x = THREE.MathUtils.degToRad(-15);
    gunGroup.add(trigger);

    // 6. Organes de visée (Sights) luminescents pour visée VR
    const sightRearGeo = new THREE.BoxGeometry(0.025, 0.012, 0.01);
    const sightRear = new THREE.Mesh(sightRearGeo, sightMat);
    sightRear.position.set(0, 0.07, 0.045);
    gunGroup.add(sightRear);

    const sightFrontGeo = new THREE.BoxGeometry(0.01, 0.015, 0.01);
    const sightFront = new THREE.Mesh(sightFrontGeo, sightMat);
    sightFront.position.set(0, 0.07, -0.165);
    gunGroup.add(sightFront);

    // 7. Muzzle Flash (effet visuel bref)
    const flashGeo = new THREE.SphereGeometry(0.035, 8, 8);
    const flashMat = new THREE.MeshBasicMaterial({
      color: 0xffaa00,
      transparent: true,
      opacity: 0
    });
    const flashMesh = new THREE.Mesh(flashGeo, flashMat);
    flashMesh.position.set(0, 0.04, -0.185);
    gunGroup.add(flashMesh);
    this.flashMesh = flashMesh;

    this.el.setObject3D('mesh', gunGroup);

    // Point de sortie du projectile (Bout du canon)
    this.muzzlePoint = new THREE.Vector3(0, 0.04, -0.185);
  },

  triggerMuzzleFlash: function () {
    if (!this.flashMesh) return;
    this.flashMesh.material.opacity = 0.9;
    this.flashMesh.scale.set(1.4, 1.4, 1.4);
    setTimeout(() => {
      if (this.flashMesh) {
        this.flashMesh.material.opacity = 0;
        this.flashMesh.scale.set(1, 1, 1);
      }
    }, 45);
  }
});

// Composant de gestion du tir de l'arme
AFRAME.registerComponent('vr-gun', {
  schema: {
    bulletSpeed: { type: 'number', default: 35.0 },     // Vitesse initiale du projectile (m/s)
    bulletGravity: { type: 'number', default: -4.5 },   // Gravité du projectile (m/s²)
    recoilAmount: { type: 'number', default: 0.02 },    // Recul visuel
    cooldown: { type: 'number', default: 180 },         // Délai min entre deux tirs (ms)
    gripAngle: { type: 'number', default: 60 }          // Angle d'inclinaison ergonomique pour manette VR (degrés)
  },

  init: function () {
    this.lastShotTime = 0;
    this.isEquipped = false;
    this.shoot = this.shoot.bind(this);
    this.onActionDown = this.onActionDown.bind(this);

    // Configurer automatiquement l'angle ergonomique de 60° sur vr-grabbable pour viser naturellement en VR
    const grabbable = this.el.components['vr-grabbable'];
    if (grabbable) {
      const rot = grabbable.data.gripRotation;
      if (!rot || (rot.x === 0 && rot.y === 0 && rot.z === 0)) {
        grabbable.data.gripRotation = { x: -this.data.gripAngle, y: 0, z: 0 };
        if (grabbable.updateGripTransform) {
          grabbable.updateGripTransform();
        }
      }
    }

    this.el.addEventListener('actiondown', this.onActionDown);
    this.el.addEventListener('triggerdown', this.shoot);

    // Support de la touche Espace / Clic souris pour tir direct
    this.onKeyDown = (evt) => {
      if (evt.code === 'Space') {
        this.shoot();
      }
    };
    window.addEventListener('keydown', this.onKeyDown);
  },

  remove: function () {
    this.el.removeEventListener('actiondown', this.onActionDown);
    this.el.removeEventListener('triggerdown', this.shoot);
    window.removeEventListener('keydown', this.onKeyDown);
  },

  onActionDown: function () {
    this.shoot();
  },

  shoot: function () {
    const now = performance.now();
    if (now - this.lastShotTime < this.data.cooldown) return;
    this.lastShotTime = now;

    // 1. Déclencher le flash de canon
    const gunModel = this.el.components['gun-model'];
    if (gunModel) {
      gunModel.triggerMuzzleFlash();
    }

    // 2. Jouer le son de tir via le synthétiseur Web Audio
    if (window.AudioFX && window.AudioFX.playGunshot) {
      const gunWorldPos = new THREE.Vector3();
      this.el.object3D.getWorldPosition(gunWorldPos);
      window.AudioFX.playGunshot(gunWorldPos);
    }

    // 3. Calculer la position de départ et la direction du tir
    const sceneEl = this.el.sceneEl;
    const muzzleLocal = (gunModel && gunModel.muzzlePoint) ? gunModel.muzzlePoint.clone() : new THREE.Vector3(0, 0.04, -0.185);

    const spawnPos = new THREE.Vector3();
    const spawnQuat = new THREE.Quaternion();
    this.el.object3D.getWorldPosition(spawnPos);
    this.el.object3D.getWorldQuaternion(spawnQuat);

    // Appliquer la transformation locale du canon au monde
    const muzzleOffsetWorld = muzzleLocal.clone().applyQuaternion(spawnQuat);
    spawnPos.add(muzzleOffsetWorld);

    // Direction avant de l'arme (-Z dans A-Frame)
    const forwardDir = new THREE.Vector3(0, 0, -1).applyQuaternion(spawnQuat).normalize();

    // 4. Instancier le projectile
    const bulletEl = document.createElement('a-entity');
    bulletEl.setAttribute('bullet', {
      speed: this.data.bulletSpeed,
      gravity: this.data.bulletGravity,
      direction: `${forwardDir.x} ${forwardDir.y} ${forwardDir.z}`
    });
    bulletEl.setAttribute('position', `${spawnPos.x} ${spawnPos.y} ${spawnPos.z}`);
    sceneEl.appendChild(bulletEl);

    // 5. Petit effet de recul visuel
    this.applyRecoil();
  },

  applyRecoil: function () {
    const mesh = this.el.getObject3D('mesh');
    if (!mesh) return;
    const startRotX = mesh.rotation.x;
    mesh.rotation.x += THREE.MathUtils.degToRad(7);
    setTimeout(() => {
      if (mesh) mesh.rotation.x = startRotX;
    }, 70);
  }
});

// Composant projectile physique
AFRAME.registerComponent('bullet', {
  schema: {
    speed: { type: 'number', default: 35.0 },
    gravity: { type: 'number', default: -4.5 },
    direction: { type: 'vec3' },
    lifetime: { type: 'number', default: 3.5 }
  },

  init: function () {
    this.spawnTime = performance.now();
    this.velocity = new THREE.Vector3(this.data.direction.x, this.data.direction.y, this.data.direction.z)
      .normalize()
      .multiplyScalar(this.data.speed);

    // Création visuelle du projectile (capsule dorée lumineuse avec traînée)
    const bulletGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.08, 8);
    bulletGeo.rotateX(Math.PI / 2);
    const bulletMat = new THREE.MeshBasicMaterial({
      color: 0xffe066
    });
    const mesh = new THREE.Mesh(bulletGeo, bulletMat);
    this.el.setObject3D('mesh', mesh);

    // Orienter le mesh dans le sens du tir
    this.el.object3D.lookAt(
      this.el.object3D.position.clone().add(this.velocity)
    );

    this.raycaster = new THREE.Raycaster();
  },

  tick: function (time, timeDelta) {
    const dt = timeDelta / 1000;
    if (dt <= 0) return;

    // Vérifier la durée de vie
    if ((performance.now() - this.spawnTime) / 1000 > this.data.lifetime) {
      this.destroy();
      return;
    }

    const currentPos = this.el.object3D.position.clone();

    // Appliquer gravité
    this.velocity.y += this.data.gravity * dt;

    // Déplacement
    const step = this.velocity.clone().multiplyScalar(dt);
    const nextPos = currentPos.clone().add(step);

    // Détection de collision précise par Raycast sur la trajectoire
    const stepLength = step.length();
    if (stepLength > 0.001) {
      const stepDir = step.clone().normalize();
      this.raycaster.set(currentPos, stepDir);
      this.raycaster.far = stepLength * 1.2;

      const targetMeshes = [];
      document.querySelectorAll('.target').forEach(tEl => {
        const tMesh = tEl.getObject3D('mesh');
        if (tMesh) {
          tMesh.userData.targetEl = tEl;
          targetMeshes.push(tMesh);
        }
      });

      const hits = this.raycaster.intersectObjects(targetMeshes, true);
      if (hits.length > 0) {
        let hitTargetEl = hits[0].object.userData.targetEl;
        let curr = hits[0].object;
        while (!hitTargetEl && curr.parent) {
          curr = curr.parent;
          if (curr.userData && curr.userData.targetEl) {
            hitTargetEl = curr.userData.targetEl;
          }
        }

        if (hitTargetEl) {
          // Impact détecté sur la cible !
          hitTargetEl.emit('hit', {
            bullet: this.el,
            point: hits[0].point,
            normal: hits[0].face ? hits[0].face.normal : null
          });
          this.destroy();
          return;
        }
      }
    }

    // Mise à jour de la position
    this.el.object3D.position.copy(nextPos);
    this.el.object3D.lookAt(nextPos.clone().add(this.velocity));

    // Collision avec le sol
    if (nextPos.y <= 0) {
      this.destroy();
    }
  },

  destroy: function () {
    if (this.el.parentNode) {
      this.el.parentNode.removeChild(this.el);
    }
  }
});
