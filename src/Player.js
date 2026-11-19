import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import fbxUrl from '../assets/Anime_character.fbx?url';
import texUrl from '../assets/textures.png?url';

const GRAVITY = -16;
const JUMP_FORCE = 6.2;
const PLAYER_RADIUS = 0.35;
const EYE_HEIGHT = 1.55;

export class Player {
    constructor(scene) {
        this.scene = scene;
        this.group = new THREE.Group();
        this.camera = null;   // set by main.js
        this.world = null;    // set by main.js

        this.velocity = new THREE.Vector3(); // horizontal
        this.vy = 0;
        this.onGround = true;
        this.speed = 9;
        this.accel = 12;
        this.stepTimer = 0;
        this.jumpQueued = false;

        this.isSitting = false;
        this.sitPosition = new THREE.Vector3();
        this.sitRotation = 0;

        this.keys = { w: false, a: false, s: false, d: false };
        this.touchInput = null; // {x, y} do analógico do celular (definido pelo TouchControls)

        this.setupModel();
        this.setupControls();
        this.setupAudio();
        this.scene.add(this.group);

        // Spawn: Center of the room to avoid any wall clipping
        this.group.position.set(0, 0, 0);
        this.group.rotation.y = Math.PI;
    }

    setupModel() {
        // --- fallback chibi (replaced by the FBX once loaded) ---
        const matHoodie = new THREE.MeshStandardMaterial({ color: 0x6e6e6e, roughness: 0.9 });
        const matPants = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
        const matSkin = new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.6 });
        const matShoe = new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.7 });
        const matEye = new THREE.MeshBasicMaterial({ color: 0xff2d78 });

        const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.42), matHoodie);
        torso.position.y = 0.62;
        this.group.add(torso);
        [-0.4, 0.4].forEach(x => {
            const arm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.6, 0.2), matHoodie);
            arm.position.set(x, 0.62, 0);
            this.group.add(arm);
        });
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.4, 0.42), matSkin);
        head.position.y = 1.18;
        this.group.add(head);
        const eyeGeo = new THREE.PlaneGeometry(0.1, 0.045);
        [-0.11, 0.11].forEach(x => {
            const eye = new THREE.Mesh(eyeGeo, matEye);
            eye.position.set(x, 1.22, 0.215);
            this.group.add(eye);
        });
        [-0.16, 0.16].forEach(x => {
            const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.42, 0.22), matPants);
            leg.position.set(x, 0.21, 0);
            this.group.add(leg);
        });
        [-0.16, 0.16].forEach(x => {
            const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.32), matShoe);
            shoe.position.set(x, 0.06, 0.04);
            this.group.add(shoe);
        });

        this.group.traverse(o => { o.castShadow = true; });
        this.applyFirstPersonVisibility();

        // --- load the real FBX character ---
        new FBXLoader().load(fbxUrl, (obj) => {
            // normalize scale to ~1.75m tall, feet at y=0
            const box = new THREE.Box3().setFromObject(obj);
            const h = box.max.y - box.min.y;
            const s = 1.75 / h;
            obj.scale.setScalar(s);
            obj.position.y = -box.min.y * s;
            obj.rotation.y = Math.PI; // face -z like the movement forward

            // apply textures.png to any material without a map
            const tex = new THREE.TextureLoader().load(texUrl, (t) => {
                t.flipY = false;
                t.colorSpace = THREE.SRGBColorSpace;
            });
            obj.traverse(o => {
                if (o.isMesh) {
                    o.castShadow = true;
                    o.frustumCulled = false;
                    const mats = Array.isArray(o.material) ? o.material : [o.material];
                    mats.forEach(m => {
                        if (m && !m.map) { m.map = tex; m.needsUpdate = true; }
                    });
                }
            });

            // remove fallback chibi, add FBX
            while (this.group.children.length) this.group.remove(this.group.children[0]);
            this.group.add(obj);
            this.applyFirstPersonVisibility();
        }, undefined, (err) => console.error('Falha ao carregar o personagem FBX:', err));
    }

    // In first person, hide everything above the waist so looking down shows the legs
    applyFirstPersonVisibility() {
        const box = new THREE.Box3();
        const center = new THREE.Vector3();
        this.group.traverse(o => {
            if (o.isMesh) {
                box.setFromObject(o);
                box.getCenter(center);
                o.visible = center.y < 0.95;
            }
        });
    }

    setupControls() {
        const typing = () => {
            const el = document.activeElement;
            return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
        };

        window.addEventListener('keydown', (e) => {
            // não anda enquanto escreve no chat ou com o quadro aberto
            if (typing() || window.__loftFrozen) return;
            const k = e.key.toLowerCase();
            if (k in this.keys) this.keys[k] = true;
            if (e.code === 'Space') {
                this.jumpQueued = true;
                e.preventDefault();
            }

            if (e.key.toLowerCase() === 'f') {
                this.toggleSit();
            }
        });
        window.addEventListener('keyup', (e) => {
            const k = e.key.toLowerCase();
            if (k in this.keys) this.keys[k] = false;
        });

        // ao abrir o chat ou o quadro, solta as teclas para não sair andando
        window.addEventListener('loft-freeze', () => {
            this.keys.w = this.keys.a = this.keys.s = this.keys.d = false;
            this.velocity.set(0, 0, 0);
        });
    }

    setupAudio() {
        this.audioCtx = null;
    }

    toggleSit() {
        if (this.isSitting) {
            this.isSitting = false;
            this.group.position.y = 0;
            return;
        }

        if (!this.world || !this.world.meetingRoom) return;

        const chairs = this.world.meetingRoom.chairs;
        let closest = null;
        let minDist = 1.5;

        for (const chair of chairs) {
            const d = this.group.position.distanceTo(chair.position);
            if (d < minDist) {
                minDist = d;
                closest = chair;
            }
        }

        if (closest) {
            this.isSitting = true;
            this.sitPosition.copy(closest.position);
            this.sitRotation = closest.rotation;

            this.group.position.set(closest.position.x, 0.4, closest.position.z);
            this.group.rotation.y = closest.rotation;
        }
    }

    unlockAudio() {
        try {
            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) { /* no audio */ }
    }

    playFootstep() {
        if (!this.audioCtx) return;
        const t = this.audioCtx.currentTime;
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(110 + Math.random() * 30, t);
        osc.frequency.exponentialRampToValueAtTime(45, t + 0.09);
        gain.gain.setValueAtTime(0.12, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
        osc.connect(gain).connect(this.audioCtx.destination);
        osc.start(t);
        osc.stop(t + 0.11);
    }

    resolveCollisions(previousX = null, previousZ = null) {
        const p = this.group.position;
        if (!this.world) return;

        const playerHeight = 1.75;
        const oldX = Number.isFinite(previousX) ? previousX : p.x;
        const oldZ = Number.isFinite(previousZ) ? previousZ : p.z;

        for (const c of this.world.colliders) {
            const colliderMinY = Number.isFinite(c.minY) ? c.minY : 0;
            const colliderMaxY = Number.isFinite(c.maxY) ? c.maxY : colliderMinY + 3;

            // Considera a altura real do obstáculo e a altura do personagem.
            // Isso impede que colisores do térreo afetem objetos do pavimento superior.
            if (p.y + playerHeight <= colliderMinY || p.y >= colliderMaxY) continue;

            const minX = c.minX - PLAYER_RADIUS;
            const maxX = c.maxX + PLAYER_RADIUS;
            const minZ = c.minZ - PLAYER_RADIUS;
            const maxZ = c.maxZ + PLAYER_RADIUS;

            const insideX = p.x > minX && p.x < maxX;
            const insideZ = p.z > minZ && p.z < maxZ;

            if (!insideX || !insideZ) {
                // Colisão varrida simples: evita atravessar paredes finas em um frame lento.
                const crossedX =
                    ((oldX <= minX && p.x >= maxX) || (oldX >= maxX && p.x <= minX)) &&
                    p.z > minZ && p.z < maxZ;
                const crossedZ =
                    ((oldZ <= minZ && p.z >= maxZ) || (oldZ >= maxZ && p.z <= minZ)) &&
                    p.x > minX && p.x < maxX;

                if (crossedX) {
                    p.x = oldX <= minX ? minX : maxX;
                    this.velocity.x = 0;
                } else if (crossedZ) {
                    p.z = oldZ <= minZ ? minZ : maxZ;
                    this.velocity.z = 0;
                }
                continue;
            }

            // Primeiro tenta expulsar o personagem pelo lado de onde ele veio.
            // Só usa a menor penetração se ele já começou o frame dentro do collider.
            if (oldX <= minX) {
                p.x = minX;
                this.velocity.x = 0;
            } else if (oldX >= maxX) {
                p.x = maxX;
                this.velocity.x = 0;
            } else if (oldZ <= minZ) {
                p.z = minZ;
                this.velocity.z = 0;
            } else if (oldZ >= maxZ) {
                p.z = maxZ;
                this.velocity.z = 0;
            } else {
                const penetrations = [
                    { axis: "x", value: p.x - minX, edge: minX },
                    { axis: "x", value: maxX - p.x, edge: maxX },
                    { axis: "z", value: p.z - minZ, edge: minZ },
                    { axis: "z", value: maxZ - p.z, edge: maxZ }
                ];
                penetrations.sort((a, b) => a.value - b.value);
                const nearest = penetrations[0];
                p[nearest.axis] = nearest.edge;
                this.velocity[nearest.axis] = 0;
            }
        }
    }

    update(dt) {
        if (!this.camera || !this.world) return;
        const p = this.group.position;

        if (this.isSitting) {
            p.y = 0.4;
            return;
        }

        // --- input ---
        let ix = 0, iz = 0;
        if (this.keys.w) iz -= 1;
        if (this.keys.s) iz += 1;
        if (this.keys.a) ix -= 1;
        if (this.keys.d) ix += 1;

        // Analógico do celular: só vale se o teclado não estiver sendo usado.
        // A força (0 a 1) controla a velocidade: empurrar pouco = andar devagar.
        let strength = 1;
        const ti = this.touchInput;
        if (ti && ix === 0 && iz === 0 && !window.__loftFrozen && (ti.x !== 0 || ti.y !== 0)) {
            ix = ti.x;
            iz = ti.y;
            strength = Math.min(1, Math.hypot(ti.x, ti.y));
        }
        const moving = ix !== 0 || iz !== 0;

        // camera-relative direction (pure vector math — no trig sign bugs):
        // W = camera forward, S = backward, D = right, A = left
        const dir = new THREE.Vector3();
        if (moving) {
            const fwd = this.camera.getWorldDirection(new THREE.Vector3());
            fwd.y = 0;
            if (fwd.lengthSq() < 0.0001) fwd.set(0, 0, -1);
            fwd.normalize();
            const right = new THREE.Vector3(-fwd.z, 0, fwd.x); // fwd rotated -90° = right
            dir.copy(fwd).multiplyScalar(-iz).addScaledVector(right, ix).normalize().multiplyScalar(strength);
        }

        // --- horizontal movement with smoothing ---
        const targetVel = dir.multiplyScalar(this.speed);
        this.velocity.lerp(targetVel, Math.min(1, this.accel * dt));
        const previousX = p.x;
        const previousZ = p.z;
        p.addScaledVector(this.velocity, dt);

        this.resolveCollisions(previousX, previousZ);

        // --- bounds: escada / galeria / interior / exterior ---
        // A altura dos degraus ultrapassa 2,2 m antes do patamar. Não aplicar
        // os limites do piso superior enquanto o personagem ainda está na escada.
        const onStairs = this.world.isOnStairs
            ? this.world.isOnStairs(p.x, p.z)
            : (p.x > -1.05 && p.x < 1.05 && p.z >= -3.42 && p.z <= 3.02);

        if (onStairs) {
            p.x = THREE.MathUtils.clamp(p.x, -0.82, 0.82);
            p.z = THREE.MathUtils.clamp(p.z, -3.42, 3.02);
        } else if (p.y > 2.2) {
            // Pavimento superior completo: mezanino (z=-10..-3.2)
            // conectado à galeria de modelagens (z=-25..-10).
            // O limite antigo terminava em x=1.1 e z=-9.6, criando uma
            // parede invisível à direita e bloqueando a entrada da galeria.
            // As paredes e guarda-corpos reais continuam controlados pelos
            // colliders do World; estes limites só evitam sair do piso.
            p.x = THREE.MathUtils.clamp(p.x, -7.45, 7.45);
            p.z = THREE.MathUtils.clamp(p.z, -24.5, -3.05);
        } else {
            p.x = THREE.MathUtils.clamp(p.x, -7.6, 40);

            // A sala de reunião ocupa x=0.5..12 e z=-25..-10.
            // O limite antigo terminava em x=7.9 e z=-16.6: ao cruzar esse
            // recorte o personagem era reposicionado bruscamente.
            const canGoDeep = p.x > 0.6 && p.x < 12.2;
            if (p.x < 8) {
                p.z = THREE.MathUtils.clamp(p.z, canGoDeep ? -25.5 : -9.6, 9.6);
            } else {
                p.z = THREE.MathUtils.clamp(p.z, -25.5, 25);
            }

            // Dentro da profundidade da sala, segura o personagem antes das
            // paredes laterais sem afetar a passagem pela porta frontal.
            if (p.z < -10.2 && p.z > -24.8) {
                p.x = THREE.MathUtils.clamp(p.x, 0.96, 11.54);
            }
        }

        // --- vertical: gravity, jump, ground (stairs/mezzanine) ---
        this.vy += GRAVITY * dt;
        p.y += this.vy * dt;

        const gh = this.world.groundHeightAt(p.x, p.z, p.y - this.vy * dt);
        if (p.y <= gh) {
            p.y = gh;
            this.vy = 0;
            this.onGround = true;
        } else {
            this.onGround = false;
        }

        if (this.jumpQueued) {
            if (this.onGround) {
                this.vy = JUMP_FORCE;
                this.onGround = false;
            }
            this.jumpQueued = false;
        }

        // --- footsteps ---
        if (moving && this.onGround) {
            this.stepTimer += dt;
            if (this.stepTimer >= 0.32) {
                this.playFootstep();
                this.stepTimer = 0;
            }
        } else {
            this.stepTimer = 0.2;
        }
    }
}
