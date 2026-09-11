/**
 * vr-controls.js
 * Contrôles Joysticks VR haute performance pour A-Frame et Meta Quest 3
 * 
 * Optimisations :
 * 1. Mises à jour directes sur Three.js Object3D (zéro allocation GC, zéro surcoût DOM setAttribute).
 * 2. Lecture directe continue du Gamepad WebXR à 90/120 Hz avec repli sur événements.
 * 3. Déplacement rigoureusement aligné sur l'orientation réelle de la tête (getWorldDirection).
 * 4. Rotation centrée sur la tête du joueur (compensation du pivot pour éviter tout effet d'orbite).
 * 5. Lissage exponentiel de vitesse (damping) et rotation fluide (smooth turn) par défaut.
 */

AFRAME.registerComponent('thumbstick-movement', {
  schema: {
    rig: { type: 'selector', default: '#rig' },
    camera: { type: 'selector', default: '#camera' },
    speed: { type: 'number', default: 2.8 },
    deadzone: { type: 'number', default: 0.12 },
    acceleration: { type: 'number', default: 14.0 } // Lissage d'accélération/freinage
  },

  init: function () {
    this.axis = { x: 0, y: 0 };
    this.currentVelocity = new THREE.Vector3();
    this.targetVelocity = new THREE.Vector3();
    this.worldDir = new THREE.Vector3();
    this.forward = new THREE.Vector3();
    this.right = new THREE.Vector3();

    this.onThumbstickMoved = this.onThumbstickMoved.bind(this);
    this.onAxisMove = this.onAxisMove.bind(this);

    this.el.addEventListener('thumbstickmoved', this.onThumbstickMoved);
    this.el.addEventListener('axismove', this.onAxisMove);
  },

  remove: function () {
    this.el.removeEventListener('thumbstickmoved', this.onThumbstickMoved);
    this.el.removeEventListener('axismove', this.onAxisMove);
  },

  onThumbstickMoved: function (evt) {
    if (evt.detail) {
      this.axis.x = evt.detail.x || 0;
      this.axis.y = evt.detail.y || 0;
    }
  },

  onAxisMove: function (evt) {
    if (evt.detail && evt.detail.axis) {
      const axes = evt.detail.axis;
      if (axes.length >= 4) {
        this.axis.x = axes[2];
        this.axis.y = axes[3];
      } else if (axes.length >= 2) {
        this.axis.x = axes[0];
        this.axis.y = axes[1];
      }
    }
  },

  getThumbstickInput: function () {
    let x = this.axis.x;
    let y = this.axis.y;

    // Lecture directe des axes matériels du Gamepad WebXR (taux de rafraîchissement natif 90/120 Hz)
    const tracked = this.el.components['tracked-controls'] ||
                    this.el.components['meta-touch-controls'] ||
                    this.el.components['oculus-touch-controls'];
    const controller = tracked && tracked.controller;
    const gamepad = controller && controller.gamepad;

    if (gamepad && gamepad.axes && gamepad.axes.length >= 2) {
      if (gamepad.axes.length >= 4) {
        x = gamepad.axes[2];
        y = gamepad.axes[3];
      } else {
        x = gamepad.axes[0];
        y = gamepad.axes[1];
      }
    }

    // Zone morte circulaire continue
    const mag = Math.hypot(x, y);
    if (mag < this.data.deadzone) {
      return { x: 0, y: 0 };
    }

    // Réponse linéaire fluide en sortie de zone morte
    const normalizedMag = Math.min((mag - this.data.deadzone) / (1.0 - this.data.deadzone), 1.0);
    const scale = normalizedMag / mag;
    return { x: x * scale, y: y * scale };
  },

  tick: function (time, timeDelta) {
    const rigEl = this.data.rig;
    const cameraEl = this.data.camera;
    if (!rigEl || !cameraEl) return;

    const dt = Math.min(timeDelta / 1000, 0.1);
    if (dt <= 0) return;

    const input = this.getThumbstickInput();

    // Récupérer le vecteur de direction réel du regard dans le monde 3D
    cameraEl.object3D.getWorldDirection(this.worldDir);

    // Projection sur le plan de marche horizontal (XZ)
    this.forward.set(this.worldDir.x, 0, this.worldDir.z);
    if (this.forward.lengthSq() > 0.0001) {
      this.forward.normalize();
    } else {
      this.forward.set(0, 0, -1);
    }

    // Vecteur latéral droit orthogonal (Right = Forward x Up)
    this.right.set(-this.forward.z, 0, this.forward.x);

    // Joystick Y négatif = avant (-y), X positif = strafe droite (+x)
    const targetX = (this.forward.x * (-input.y) + this.right.x * input.x) * this.data.speed;
    const targetZ = (this.forward.z * (-input.y) + this.right.z * input.x) * this.data.speed;
    this.targetVelocity.set(targetX, 0, targetZ);

    // Amortissement exponentiel de la vitesse (évite tout à-coup ou saccade)
    const factor = 1 - Math.exp(-this.data.acceleration * dt);
    this.currentVelocity.lerp(this.targetVelocity, factor);

    if (this.currentVelocity.lengthSq() > 0.000001) {
      // Déplacement direct de l'Object3D Three.js sans altérer le DOM A-Frame
      rigEl.object3D.position.x += this.currentVelocity.x * dt;
      rigEl.object3D.position.z += this.currentVelocity.z * dt;
    }
  }
});

AFRAME.registerComponent('thumbstick-turn', {
  schema: {
    rig: { type: 'selector', default: '#rig' },
    camera: { type: 'selector', default: '#camera' },
    mode: { type: 'string', default: 'smooth' },   // 'smooth' (fluide) ou 'snap' (paliers)
    turnAngle: { type: 'number', default: 45 },    // Degrés par impulsion en mode snap
    smoothSpeed: { type: 'number', default: 90 },  // Degrés par seconde en mode smooth
    deadzone: { type: 'number', default: 0.15 },
    snapRepeatDelay: { type: 'number', default: 400 },   // Délai avant répétition (ms)
    snapRepeatInterval: { type: 'number', default: 220 } // Intervalle entre répétitions (ms)
  },

  init: function () {
    this.axisX = 0;
    this.canSnap = true;
    this.snapHeld = false;
    this.lastSnapTime = 0;

    this.camWorldPosBefore = new THREE.Vector3();
    this.camWorldPosAfter = new THREE.Vector3();

    this.onThumbstickMoved = this.onThumbstickMoved.bind(this);
    this.onAxisMove = this.onAxisMove.bind(this);

    this.el.addEventListener('thumbstickmoved', this.onThumbstickMoved);
    this.el.addEventListener('axismove', this.onAxisMove);
  },

  remove: function () {
    this.el.removeEventListener('thumbstickmoved', this.onThumbstickMoved);
    this.el.removeEventListener('axismove', this.onAxisMove);
  },

  onThumbstickMoved: function (evt) {
    if (evt.detail) {
      this.axisX = evt.detail.x || 0;
    }
  },

  onAxisMove: function (evt) {
    if (evt.detail && evt.detail.axis) {
      const axes = evt.detail.axis;
      if (axes.length >= 4) {
        this.axisX = axes[2];
      } else if (axes.length >= 2) {
        this.axisX = axes[0];
      }
    }
  },

  getAxisX: function () {
    let x = this.axisX;
    const tracked = this.el.components['tracked-controls'] ||
                    this.el.components['meta-touch-controls'] ||
                    this.el.components['oculus-touch-controls'];
    const controller = tracked && tracked.controller;
    const gamepad = controller && controller.gamepad;

    if (gamepad && gamepad.axes && gamepad.axes.length >= 2) {
      x = gamepad.axes.length >= 4 ? gamepad.axes[2] : gamepad.axes[0];
    }
    return x;
  },

  /**
   * Rotation du rig centrée sur la tête du joueur.
   * Compense le décalage de la caméra par rapport à l'origine du rig pour
   * éviter que la tête ne soit déportée sur un arc de cercle.
   */
  rotateRigAroundCamera: function (deltaRad) {
    const rigEl = this.data.rig;
    const cameraEl = this.data.camera;
    if (!rigEl || !rigEl.object3D) return;

    const rigObj = rigEl.object3D;
    const camObj = cameraEl && cameraEl.object3D;

    if (camObj) {
      // 1. Position mondiale actuelle de la tête
      camObj.getWorldPosition(this.camWorldPosBefore);

      // 2. Rotation du rig
      rigObj.rotation.y += deltaRad;
      rigObj.updateMatrixWorld(true);

      // 3. Position mondiale de la tête après rotation du rig
      camObj.getWorldPosition(this.camWorldPosAfter);

      // 4. Compensation pour maintenir la tête exactement au même point dans la pièce
      rigObj.position.x += (this.camWorldPosBefore.x - this.camWorldPosAfter.x);
      rigObj.position.z += (this.camWorldPosBefore.z - this.camWorldPosAfter.z);
    } else {
      rigObj.rotation.y += deltaRad;
    }
  },

  tick: function (time, timeDelta) {
    const rigEl = this.data.rig;
    if (!rigEl) return;

    const dt = Math.min(timeDelta / 1000, 0.1);
    if (dt <= 0) return;

    const x = this.getAxisX();

    if (this.data.mode === 'smooth') {
      const absX = Math.abs(x);
      if (absX < this.data.deadzone) return;

      // Courbe de sensibilité progressive (douce au centre, rapide aux extrémités)
      const sign = Math.sign(x);
      const normalizedX = (absX - this.data.deadzone) / (1.0 - this.data.deadzone);
      const curvedX = sign * Math.pow(Math.min(normalizedX, 1.0), 1.2);

      // Joystick droite (x > 0) -> rotation vers la droite (Y négatif Three.js)
      const deltaRad = -curvedX * THREE.MathUtils.degToRad(this.data.smoothSpeed) * dt;
      this.rotateRigAroundCamera(deltaRad);

    } else if (this.data.mode === 'snap') {
      const threshold = 0.6;
      const absX = Math.abs(x);

      if (absX > threshold) {
        const now = performance.now();
        const canTriggerInitial = this.canSnap;
        const canTriggerRepeat = this.snapHeld && (now - this.lastSnapTime > this.snapRepeatInterval);

        if (canTriggerInitial || canTriggerRepeat) {
          const direction = x > 0 ? -1 : 1;
          const deltaRad = direction * THREE.MathUtils.degToRad(this.data.turnAngle);
          this.rotateRigAroundCamera(deltaRad);

          this.lastSnapTime = canTriggerInitial
            ? now + (this.data.snapRepeatDelay - this.data.snapRepeatInterval)
            : now;
          this.canSnap = false;
          this.snapHeld = true;
        }
      } else if (absX < 0.2) {
        this.canSnap = true;
        this.snapHeld = false;
      }
    }
  }
});
