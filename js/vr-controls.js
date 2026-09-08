/**
 * vr-controls.js
 * Gestion du déplacement par joysticks VR pour A-Frame
 * - Joystick gauche : déplacement avant/arrière/gauche/droite selon l'orientation de la caméra
 * - Joystick droit : rotation de la vue (snap turn ou smooth turn)
 */

AFRAME.registerComponent('thumbstick-movement', {
  schema: {
    rig: { type: 'selector', default: '#rig' },
    camera: { type: 'selector', default: '#camera' },
    speed: { type: 'number', default: 3.0 }
  },

  init: function () {
    this.axis = { x: 0, y: 0 };
    this.onThumbstickMoved = this.onThumbstickMoved.bind(this);
    this.el.addEventListener('thumbstickmoved', this.onThumbstickMoved);
  },

  remove: function () {
    this.el.removeEventListener('thumbstickmoved', this.onThumbstickMoved);
  },

  onThumbstickMoved: function (evt) {
    this.axis.x = evt.detail.x;
    this.axis.y = evt.detail.y;
  },

  tick: function (time, timeDelta) {
    if (!this.data.rig || !this.data.camera) return;
    const x = this.axis.x;
    const y = this.axis.y;

    // Seuil de zone morte (deadzone)
    if (Math.abs(x) < 0.15 && Math.abs(y) < 0.15) return;

    const dt = timeDelta / 1000;
    const speed = this.data.speed;

    // Récupérer l'angle horizontal de la caméra (yaw)
    const cameraEl = this.data.camera;
    const camRotation = cameraEl.getAttribute('rotation');
    const rigEl = this.data.rig;
    const rigRotation = rigEl.getAttribute('rotation');

    const totalYaw = THREE.MathUtils.degToRad((camRotation ? camRotation.y : 0) + (rigRotation ? rigRotation.y : 0));

    // Calcul des vecteurs directionnels (avant et strafe droit)
    const sinYaw = Math.sin(totalYaw);
    const cosYaw = Math.cos(totalYaw);

    // Joystick Y négatif = vers l'avant, X positif = vers la droite
    const forwardX = -sinYaw;
    const forwardZ = -cosYaw;
    const rightX = cosYaw;
    const rightZ = -sinYaw;

    const moveX = (forwardX * (-y) + rightX * x) * speed * dt;
    const moveZ = (forwardZ * (-y) + rightZ * x) * speed * dt;

    const currentPos = rigEl.getAttribute('position');
    rigEl.setAttribute('position', {
      x: currentPos.x + moveX,
      y: currentPos.y,
      z: currentPos.z + moveZ
    });
  }
});

AFRAME.registerComponent('thumbstick-turn', {
  schema: {
    rig: { type: 'selector', default: '#rig' },
    turnAngle: { type: 'number', default: 45 }, // Degrés pour snap turn
    mode: { type: 'string', default: 'snap' },    // 'snap' ou 'smooth'
    smoothSpeed: { type: 'number', default: 80 }  // Degrés par seconde pour smooth
  },

  init: function () {
    this.axisX = 0;
    this.canSnap = true;
    this.onThumbstickMoved = this.onThumbstickMoved.bind(this);
    this.el.addEventListener('thumbstickmoved', this.onThumbstickMoved);
  },

  remove: function () {
    this.el.removeEventListener('thumbstickmoved', this.onThumbstickMoved);
  },

  onThumbstickMoved: function (evt) {
    this.axisX = evt.detail.x;

    if (this.data.mode === 'snap') {
      const threshold = 0.6;
      if (Math.abs(this.axisX) > threshold && this.canSnap) {
        const rigEl = this.data.rig;
        if (!rigEl) return;
        const currentRot = rigEl.getAttribute('rotation') || { x: 0, y: 0, z: 0 };
        const direction = this.axisX > 0 ? -1 : 1;
        rigEl.setAttribute('rotation', {
          x: currentRot.x,
          y: currentRot.y + direction * this.data.turnAngle,
          z: currentRot.z
        });
        this.canSnap = false;
      } else if (Math.abs(this.axisX) < 0.2) {
        this.canSnap = true;
      }
    }
  },

  tick: function (time, timeDelta) {
    if (this.data.mode !== 'smooth') return;
    if (Math.abs(this.axisX) < 0.15) return;
    const rigEl = this.data.rig;
    if (!rigEl) return;
    const dt = timeDelta / 1000;
    const currentRot = rigEl.getAttribute('rotation') || { x: 0, y: 0, z: 0 };
    rigEl.setAttribute('rotation', {
      x: currentRot.x,
      y: currentRot.y - this.axisX * this.data.smoothSpeed * dt,
      z: currentRot.z
    });
  }
});
