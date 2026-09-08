/**
 * targets-audio.js
 * - Synthétiseur audio spatialisé via Web Audio API (aucun fichier externe requis)
 * - Générateur d'effets de particules d'impact
 * - Composants de cibles 3D variées (cubes, cônes, cylindres)
 * - Spawner de cibles aléatoires avec cycle de vie et tableau de score
 */

// ==========================================
// 1. MOTEUR AUDIO PROCÉDURAL (Web Audio API)
// ==========================================
class WebAudioFX {
  constructor() {
    this.ctx = null;
    this.masterVolume = 0.8;
    this.initContext = this.initContext.bind(this);
    window.addEventListener('click', this.initContext, { once: true });
    window.addEventListener('keydown', this.initContext, { once: true });
  }

  initContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  // Calcul de l'atténuation du volume selon la distance du joueur
  getDistanceGain(pos) {
    if (!pos) return 1.0;
    const cam = document.querySelector('#camera');
    if (!cam) return 1.0;
    const camPos = new THREE.Vector3();
    cam.object3D.getWorldPosition(camPos);
    const dist = camPos.distanceTo(pos);
    // Formule d'atténuation réaliste
    return Math.max(0.1, 1.0 / (1.0 + dist * 0.12));
  }

  // Son de tir punchy (bruit filtré + onde percussive)
  playGunshot(position) {
    this.initContext();
    if (!this.ctx) return;

    const ctx = this.ctx;
    const now = ctx.currentTime;
    const distGain = this.getDistanceGain(position);

    // Bruit blanc percussif
    const bufferSize = ctx.sampleRate * 0.12;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.18));
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(3200, now);
    filter.frequency.exponentialRampToValueAtTime(150, now + 0.12);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(this.masterVolume * distGain * 0.9, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start(now);

    // Onde de choc basse fréquence (détonation)
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(30, now + 0.15);

    oscGain.gain.setValueAtTime(this.masterVolume * distGain * 0.7, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    osc.connect(oscGain);
    oscGain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.16);
  }

  // Son d'impact / explosion métallique sur les cibles
  playHitSound(position) {
    this.initContext();
    if (!this.ctx) return;

    const ctx = this.ctx;
    const now = ctx.currentTime;
    const distGain = this.getDistanceGain(position);

    // Son de cloche / impact métallique agréable
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(980, now);
    osc1.frequency.exponentialRampToValueAtTime(320, now + 0.4);

    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(1470, now);
    osc2.frequency.exponentialRampToValueAtTime(440, now + 0.35);

    gainNode.gain.setValueAtTime(this.masterVolume * distGain * 1.0, now);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

    osc1.connect(gainNode);
    osc2.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.46);
    osc2.stop(now + 0.46);

    // Craquement d'éclats (bruit court)
    const burstSize = ctx.sampleRate * 0.08;
    const burstBuffer = ctx.createBuffer(1, burstSize, ctx.sampleRate);
    const burstData = burstBuffer.getChannelData(0);
    for (let i = 0; i < burstSize; i++) {
      burstData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (burstSize * 0.25));
    }
    const burst = ctx.createBufferSource();
    burst.buffer = burstBuffer;
    const bGain = ctx.createGain();
    bGain.gain.setValueAtTime(this.masterVolume * distGain * 0.6, now);
    bGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    burst.connect(bGain);
    bGain.connect(ctx.destination);
    burst.start(now);
  }

  // Son d'apparition d'une cible
  playSpawnSound(position) {
    this.initContext();
    if (!this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const distGain = this.getDistanceGain(position);

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.exponentialRampToValueAtTime(650, now + 0.15);

    gain.gain.setValueAtTime(this.masterVolume * distGain * 0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.16);
  }
}

window.AudioFX = new WebAudioFX();


// ==========================================
// 2. EFFETS DE PARTICULES D'IMPACT
// ==========================================
AFRAME.registerComponent('particle-burst', {
  schema: {
    color: { type: 'color', default: '#ffaa00' },
    count: { type: 'number', default: 22 },
    duration: { type: 'number', default: 650 }
  },

  init: function () {
    this.startTime = performance.now();
    this.particles = [];

    const group = new THREE.Group();
    const pGeo = new THREE.BoxGeometry(0.06, 0.06, 0.06);

    const colors = [0xff3366, 0xffbb00, 0x00e5ff, 0xffffff];

    for (let i = 0; i < this.data.count; i++) {
      const pMat = new THREE.MeshBasicMaterial({
        color: colors[i % colors.length]
      });
      const mesh = new THREE.Mesh(pGeo, pMat);

      // Vitesse aléatoire sphérique
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);
      const speed = 2.0 + Math.random() * 4.5;

      const vel = new THREE.Vector3(
        speed * Math.sin(phi) * Math.cos(theta),
        speed * Math.sin(phi) * Math.sin(theta) + 1.2,
        speed * Math.cos(phi)
      );

      group.add(mesh);
      this.particles.push({
        mesh: mesh,
        velocity: vel,
        rotSpeed: new THREE.Vector3(
          Math.random() * 10 - 5,
          Math.random() * 10 - 5,
          Math.random() * 10 - 5
        )
      });
    }

    this.el.setObject3D('mesh', group);
  },

  tick: function (time, timeDelta) {
    const elapsed = performance.now() - this.startTime;
    const progress = elapsed / this.data.duration;
    if (progress >= 1.0) {
      if (this.el.parentNode) {
        this.el.parentNode.removeChild(this.el);
      }
      return;
    }

    const dt = timeDelta / 1000;
    const scale = Math.max(0.001, 1.0 - progress);

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      p.velocity.y -= 7.0 * dt; // Gravité sur les particules
      p.mesh.position.addScaledVector(p.velocity, dt);
      p.mesh.rotation.x += p.rotSpeed.x * dt;
      p.mesh.rotation.y += p.rotSpeed.y * dt;
      p.mesh.scale.set(scale, scale, scale);
    }
  }
});


// ==========================================
// 3. COMPOSANT CIBLE (TARGET)
// ==========================================
AFRAME.registerComponent('target', {
  schema: {
    points: { type: 'number', default: 100 },
    shapeType: { type: 'string', default: 'cube' }
  },

  init: function () {
    this.el.classList.add('target');
    this.isHit = false;
    this.onHit = this.onHit.bind(this);
    this.el.addEventListener('hit', this.onHit);

    // Animation de flottement doux
    this.initialY = this.el.object3D.position.y;
    this.floatSpeed = 1.5 + Math.random();
    this.floatOffset = Math.random() * Math.PI * 2;
  },

  remove: function () {
    this.el.removeEventListener('hit', this.onHit);
  },

  onHit: function (evt) {
    if (this.isHit) return;
    this.isHit = true;

    let hitPos = this.el.object3D.position.clone();
    if (evt && evt.detail) {
      if (evt.detail.point) hitPos = evt.detail.point;
      else if (evt.detail.position) hitPos = evt.detail.position;
    }

    // 1. Jouer le son d'impact avec atténuation 3D
    if (window.AudioFX) {
      window.AudioFX.playHitSound(hitPos);
    }

    // 2. Générer l'effet de particules d'explosion
    const burstEl = document.createElement('a-entity');
    burstEl.setAttribute('particle-burst', { count: 24, duration: 700 });
    burstEl.setAttribute('position', `${hitPos.x} ${hitPos.y} ${hitPos.z}`);
    this.el.sceneEl.appendChild(burstEl);

    // 3. Mettre à jour le score global
    if (window.GameManager) {
      window.GameManager.addScore(this.data.points);
    }

    // 4. Animation rapide de destruction
    const obj = this.el.object3D;
    let s = 1.0;
    const shrinkInterval = setInterval(() => {
      s -= 0.2;
      if (s <= 0.1) {
        clearInterval(shrinkInterval);
        if (this.el.parentNode) {
          this.el.parentNode.removeChild(this.el);
        }
      } else {
        obj.scale.set(s, s, s);
      }
    }, 25);
  },

  tick: function (time) {
    if (this.isHit) return;
    // Rotation lente et oscillation verticale pour dynamisme visuel
    const t = time / 1000;
    this.el.object3D.rotation.y += 0.015;
    this.el.object3D.position.y = this.initialY + Math.sin(t * this.floatSpeed + this.floatOffset) * 0.12;
  }
});


// ==========================================
// 4. GÉNÉRATEUR ALÉATOIRE DE CIBLES (SPAWNER)
// ==========================================
AFRAME.registerComponent('target-spawner', {
  schema: {
    interval: { type: 'number', default: 2800 }, // Délai entre apparitions (ms)
    maxTargets: { type: 'number', default: 7 },   // Nombre max de cibles simultanées
    minZ: { type: 'number', default: -15 },
    maxZ: { type: 'number', default: -6 },
    minX: { type: 'number', default: -5 },
    maxX: { type: 'number', default: 5 },
    minY: { type: 'number', default: 1.2 },
    maxY: { type: 'number', default: 3.5 }
  },

  init: function () {
    this.lastSpawnTime = performance.now();
    // Créer quelques cibles initiales au démarrage
    this.spawnInitialTargets(4);
  },

  spawnInitialTargets: function (count) {
    for (let i = 0; i < count; i++) {
      this.spawnOneTarget();
    }
  },

  spawnOneTarget: function () {
    const currentTargets = document.querySelectorAll('.target').length;
    if (currentTargets >= this.data.maxTargets) return;

    const shapes = ['cube', 'cone', 'cylinder', 'sphere'];
    const selectedShape = shapes[Math.floor(Math.random() * shapes.length)];

    const posX = this.data.minX + Math.random() * (this.data.maxX - this.data.minX);
    const posY = this.data.minY + Math.random() * (this.data.maxY - this.data.minY);
    const posZ = this.data.minZ + Math.random() * (this.data.maxZ - this.data.minZ);

    const colors = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#00cec9'];
    const chosenColor = colors[Math.floor(Math.random() * colors.length)];

    const targetEl = document.createElement('a-entity');
    targetEl.setAttribute('target', { points: 100, shapeType: selectedShape });
    targetEl.setAttribute('position', `${posX.toFixed(2)} ${posY.toFixed(2)} ${posZ.toFixed(2)}`);
    targetEl.setAttribute('shadow', 'cast: true; receive: true');

    // Définition de la géométrie selon la forme choisie
    if (selectedShape === 'cube') {
      targetEl.setAttribute('geometry', 'primitive: box; width: 0.7; height: 0.7; depth: 0.7');
    } else if (selectedShape === 'cone') {
      targetEl.setAttribute('geometry', 'primitive: cone; radiusBottom: 0.45; height: 0.9; segmentsRadial: 16');
    } else if (selectedShape === 'cylinder') {
      targetEl.setAttribute('geometry', 'primitive: cylinder; radius: 0.45; height: 0.6; segmentsRadial: 16');
    } else {
      targetEl.setAttribute('geometry', 'primitive: sphere; radius: 0.45; segmentsWidth: 16; segmentsHeight: 16');
    }

    targetEl.setAttribute('material', `color: ${chosenColor}; metalness: 0.4; roughness: 0.3; emissive: ${chosenColor}; emissiveIntensity: 0.2`);

    this.el.sceneEl.appendChild(targetEl);

    // Son d'apparition
    if (window.AudioFX) {
      window.AudioFX.playSpawnSound(new THREE.Vector3(posX, posY, posZ));
    }
  },

  tick: function (time) {
    if (time - this.lastSpawnTime > this.data.interval) {
      this.lastSpawnTime = time;
      this.spawnOneTarget();
    }
  }
});


// ==========================================
// 5. GESTIONNAIRE DE SCORE (GameManager)
// ==========================================
class GameManagerClass {
  constructor() {
    this.score = 0;
    this.hits = 0;
  }

  addScore(points) {
    this.score += points;
    this.hits += 1;
    this.updateHUD();
  }

  updateHUD() {
    // Mise à jour de l'affichage 3D dans la scène
    const score3DEl = document.querySelector('#score-3d-text');
    if (score3DEl) {
      score3DEl.setAttribute('value', `SCORE: ${this.score}  |  TOUCHES: ${this.hits}`);
    }
    // Mise à jour de l'overlay HUD HTML
    const hudScoreEl = document.querySelector('#hud-score');
    if (hudScoreEl) {
      hudScoreEl.innerText = `Score: ${this.score} | Cibles: ${this.hits}`;
    }
  }

  reset() {
    this.score = 0;
    this.hits = 0;
    this.updateHUD();
  }
}

window.GameManager = new GameManagerClass();
