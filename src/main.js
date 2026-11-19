import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { World } from './World.js';
import { Player } from './Player.js';
import { CameraManager } from './CameraManager.js';
import { TVPyramid } from './TVPyramid.js';
import { ProjectorScreen } from './ProjectorScreen.js';
import { MeetingRoom } from './MeetingRoom.js';
import { Chat } from './Chat.js';
import { VoiceChat } from './VoiceChat.js';
import { MultiplayerManager } from './Multiplayer.js';
import { TouchControls } from './TouchControls.js';

export const IS_MOBILE = typeof window !== 'undefined' &&
    (window.matchMedia('(pointer: coarse)').matches ||
        /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
        (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent)));

// No Safari/Android, evita upload de VideoTexture (texImage2D) 60x por segundo
if (IS_MOBILE && THREE.VideoTexture && !THREE.VideoTexture.prototype.__mobileThrottled) {
    const origVideoUpdate = THREE.VideoTexture.prototype.update;
    THREE.VideoTexture.prototype.update = function () {
        const now = performance.now();
        if (this.__lastMobileUpload && now - this.__lastMobileUpload < 80) return;
        this.__lastMobileUpload = now;
        origVideoUpdate.call(this);
    };
    THREE.VideoTexture.prototype.__mobileThrottled = true;
}

class Experience {
    constructor() {
        this.container = document.getElementById('app');
        this.prompt = document.getElementById('audio-prompt');
        this.started = false;
        this.paused = false;
        this.frameCount = 0;
        this.mobilePixelRatio = 0.55;
        this.exteriorSmallProps = [];

        if (IS_MOBILE) {
            this.injectMobileCSS();
        }

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87b5dd);
        this.scene.fog = new THREE.FogExp2(0x87b5dd, IS_MOBILE ? 0.0175 : 0.006);

        this.renderer = new THREE.WebGLRenderer({
            antialias: !IS_MOBILE,
            alpha: false,
            depth: true,
            stencil: false,
            precision: IS_MOBILE ? 'mediump' : 'highp',
            powerPreference: 'high-performance'
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(
            IS_MOBILE ? this.mobilePixelRatio : Math.min(window.devicePixelRatio || 1, 1.75)
        );
        this.renderer.shadowMap.enabled = !IS_MOBILE;
        if (!IS_MOBILE) {
            this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        }
        this.container.appendChild(this.renderer.domElement);

        this.clock = new THREE.Clock();

        this.init();
    }

    injectMobileCSS() {
        if (document.body) document.body.classList.add('is-mobile');
        const style = document.createElement('style');
        style.textContent = `
            body.is-mobile .menu-btn,
            body.is-mobile .instructions,
            body.is-mobile #chat,
            body.is-mobile #voice-pill,
            body.is-mobile #board-ui,
            body.is-mobile .pause-hud-btn,
            body.is-mobile #pause-menu {
                backdrop-filter: none !important;
                -webkit-backdrop-filter: none !important;
            }
            body.is-mobile #chat,
            body.is-mobile #voice-pill,
            body.is-mobile .instructions,
            body.is-mobile .pause-hud-btn,
            body.is-mobile .pause-card {
                background: rgba(14, 15, 18, 0.94) !important;
            }
        `;
        document.head.appendChild(style);
    }

    showError(msg) {
        console.error(msg);
        const el = document.createElement('div');
        el.style.cssText = 'position:fixed;bottom:10px;left:10px;background:#600;color:#fff;padding:8px 12px;font:12px monospace;z-index:9999;max-width:80vw;white-space:pre-wrap;';
        el.textContent = 'ERRO: ' + msg;
        document.body.appendChild(el);
    }

    async init() {
        window.addEventListener('error', (e) => this.showError(e.message));
        window.addEventListener('unhandledrejection', (e) => this.showError(String(e.reason && e.reason.stack || e.reason)));

        try {
            this.build();
        } catch (err) {
            this.showError(err && err.stack ? err.stack : String(err));
            return;
        }
        this.ready = true;
        if (typeof this.renderer.compileAsync === 'function') {
            this.renderer.compileAsync(this.scene, this.cameraManager.camera)
                .catch((err) => console.warn('Pré-compilação gráfica ignorada:', err));
        }
    }

    build() {
        this.setupMenu();
        this.setupPause();

        this.world = new World(this.scene);

        this.player = new Player(this.scene);
        this.player.world = this.world;
        const spawnXs = [-4, -2.5, -1, 0.5, 2];
        const spawnZs = [5.5, 7, 8.5];
        this.spawn = {
            x: spawnXs[Math.floor(Math.random() * spawnXs.length)],
            z: spawnZs[Math.floor(Math.random() * spawnZs.length)]
        };
        this.player.group.position.set(this.spawn.x, 0, this.spawn.z);

        this.cameraManager = new CameraManager(this.scene, this.player, this.renderer.domElement);
        this.player.camera = this.cameraManager.camera;

        this.touch = new TouchControls({
            player: this.player,
            cameraManager: this.cameraManager,
            dom: this.renderer.domElement,
            onPause: () => this.pause()
        });

        this.tvPyramid = new TVPyramid(this.scene, new THREE.Vector3(-6.8, 0, 7.5), this.world.colliders);
        this.tvPyramid.setListener(this.cameraManager.camera);

        this.projector = new ProjectorScreen(this.scene);

        this.meetingRoom = new MeetingRoom(this.scene, this.world);
        this.world.meetingRoom = this.meetingRoom;
        this.projector.addMirrorScreen(this.meetingRoom.transmissionScreen);

        if (IS_MOBILE) {
            this.optimizeSceneForMobile();
        }

        window.addEventListener('resize', () => this.onWindowResize());

        window.addEventListener('beforeunload', () => {
            if (this.multiplayer) this.multiplayer.disconnect();
        });
    }

    getMaterialSignature(mat) {
        const color = mat.color ? mat.color.getHexString() : 'ffffff';
        const emissive = mat.emissive ? mat.emissive.getHexString() : '000000';
        const mapId = mat.map ? mat.map.uuid : 'nomap';
        const emMapId = mat.emissiveMap ? mat.emissiveMap.uuid : 'noem';
        return `${mat.type}_${color}_${emissive}_${mapId}_${emMapId}_${mat.side}_${mat.vertexColors ? 1 : 0}`;
    }

    optimizeSceneForMobile() {
        const materialCache = new Map();
        const lightsToRemove = [];

        const optimizeTexture = (tex) => {
            if (!tex) return;
            tex.anisotropy = 1;
            if (tex.isCanvasTexture || tex.isVideoTexture) {
                tex.generateMipmaps = false;
                tex.minFilter = THREE.LinearFilter;
                tex.magFilter = THREE.LinearFilter;
                tex.needsUpdate = true;
            }
        };

        const cleanTransparency = (mat) => {
            if (!mat) return;
            const hasAlphaTexture = Boolean(mat.alphaMap) ||
                (mat.map && mat.map.format === THREE.RGBAFormat && mat.alphaTest > 0);
            if (mat.transparent && (mat.opacity === undefined || mat.opacity >= 0.98) && !hasAlphaTexture) {
                mat.transparent = false;
                mat.depthWrite = true;
            }
            if (mat.transparent) {
                mat.depthWrite = false;
            }
        };

        const convertMaterial = (mat) => {
            if (!mat) return mat;

            if (mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial) {
                const fastMat = new THREE.MeshLambertMaterial({
                    color: mat.color ? mat.color.clone() : new THREE.Color(0xffffff),
                    map: mat.map || null,
                    emissive: mat.emissive ? mat.emissive.clone() : new THREE.Color(0x000000),
                    emissiveMap: mat.emissiveMap || null,
                    emissiveIntensity: mat.emissiveIntensity ?? 1,
                    transparent: mat.transparent,
                    opacity: mat.opacity,
                    alphaMap: mat.alphaMap || null,
                    alphaTest: mat.alphaTest,
                    side: mat.side,
                    vertexColors: mat.vertexColors,
                    fog: mat.fog,
                    toneMapped: mat.toneMapped,
                    depthWrite: mat.depthWrite,
                    depthTest: mat.depthTest,
                    flatShading: mat.flatShading
                });

                optimizeTexture(fastMat.map);
                optimizeTexture(fastMat.emissiveMap);
                optimizeTexture(fastMat.alphaMap);
                cleanTransparency(fastMat);

                const sig = this.getMaterialSignature(fastMat);
                if (!fastMat.transparent && materialCache.has(sig)) {
                    fastMat.dispose();
                    mat.dispose();
                    return materialCache.get(sig);
                }
                if (!fastMat.transparent) {
                    materialCache.set(sig, fastMat);
                }
                mat.dispose();
                return fastMat;
            }

            optimizeTexture(mat.map);
            optimizeTexture(mat.emissiveMap);
            cleanTransparency(mat);

            const sig = this.getMaterialSignature(mat);
            if (!mat.transparent && materialCache.has(sig)) {
                return materialCache.get(sig);
            }
            if (!mat.transparent) {
                materialCache.set(sig, mat);
            }
            return mat;
        };

        this.scene.traverse((obj) => {
            obj.castShadow = false;
            obj.receiveShadow = false;

            if (obj.isPositionalAudio && obj.panner) {
                obj.panner.panningModel = 'equalpower';
            }

            if (obj.isLight) {
                if (obj.isAmbientLight || obj.isHemisphereLight || obj.isDirectionalLight) {
                    obj.castShadow = false;
                } else {
                    lightsToRemove.push(obj);
                }
            }

            if (obj.isPoints && obj.geometry) {
                const pos = obj.geometry.attributes.position;
                if (pos && pos.count > 100) {
                    obj.geometry.setDrawRange(0, 100);
                }
            }

            if (obj.isMesh && obj.material) {
                if (Array.isArray(obj.material)) {
                    obj.material = obj.material.map(convertMaterial);
                } else {
                    obj.material = convertMaterial(obj.material);
                }
            }
        });

        for (const light of lightsToRemove) {
            if (light.parent) light.parent.remove(light);
            if (light.target && light.target.parent) light.target.parent.remove(light.target);
        }

        this.batchStaticMeshesForMobile();
    }

    batchStaticMeshesForMobile() {
        const mergeFn = BufferGeometryUtils.mergeGeometries || BufferGeometryUtils.mergeBufferGeometries;
        if (!mergeFn) return;

        this.scene.updateMatrixWorld(true);

        const protectedObjects = new Set();
        const protectTree = (root) => {
            if (!root) return;
            root.traverse((child) => protectedObjects.add(child));
        };

        protectTree(this.player?.group);
        if (this.meetingRoom?.transmissionScreen) {
            protectedObjects.add(this.meetingRoom.transmissionScreen);
        }
        if (this.meetingRoom?.whiteboard?.mesh) {
            protectTree(this.meetingRoom.whiteboard.mesh);
        }

        const buckets = new Map();
        const box = new THREE.Box3();
        const center = new THREE.Vector3();
        const size = new THREE.Vector3();

        this.scene.traverse((obj) => {
            if (!obj.isMesh || !obj.visible || protectedObjects.has(obj)) return;
            if (obj.isSkinnedMesh || obj.isInstancedMesh) return;
            if (Array.isArray(obj.material) || !obj.material || !obj.geometry) return;
            if (obj.matrixWorld.determinant() < 0) return;

            const mat = obj.material;
            if (mat.transparent) return;
            if (mat.map?.isVideoTexture || mat.map?.isCanvasTexture) return;
            if (mat.emissiveMap?.isVideoTexture || mat.emissiveMap?.isCanvasTexture) return;

            box.setFromObject(obj);
            if (box.isEmpty()) return;
            box.getCenter(center);
            box.getSize(size);

            if (Math.max(size.x, size.z) > 45) return;

            let zone = 'interior';
            if (center.z < -10.2) {
                zone = 'backrooms';
            } else if (box.min.x <= 7.8 && box.max.x > 7.8) {
                zone = 'glassframe';
            } else if (center.x > 7.8) {
                zone = 'exterior';
            }

            const key = `${zone}_${this.getMaterialSignature(mat)}`;
            if (!buckets.has(key)) {
                buckets.set(key, { mat, meshes: [] });
            }
            buckets.get(key).meshes.push(obj);
        });

        for (const { mat, meshes } of buckets.values()) {
            if (meshes.length < 2) continue;

            const needsUV = Boolean(mat.map || mat.emissiveMap || mat.alphaMap);
            const normalized = [];
            const validMeshes = [];

            for (const mesh of meshes) {
                const src = mesh.geometry;
                if (!src.attributes.position) continue;
                if (needsUV && !src.attributes.uv) continue;

                const g = src.index ? src.toNonIndexed() : src.clone();
                g.applyMatrix4(mesh.matrixWorld);
                if (!g.attributes.normal) {
                    g.computeVertexNormals();
                }

                for (const attrName of Object.keys(g.attributes)) {
                    if (attrName === 'position' || attrName === 'normal') continue;
                    if (attrName === 'uv' && needsUV) continue;
                    g.deleteAttribute(attrName);
                }

                normalized.push(g);
                validMeshes.push(mesh);
            }

            if (normalized.length < 2) {
                normalized.forEach((g) => g.dispose());
                continue;
            }

            const merged = mergeFn(normalized, false);
            normalized.forEach((g) => g.dispose());
            if (!merged) continue;

            merged.computeBoundingSphere();
            const batched = new THREE.Mesh(merged, mat);
            batched.frustumCulled = true;
            this.scene.add(batched);

            for (const m of validMeshes) {
                if (m.parent) m.parent.remove(m);
                m.geometry.dispose();
            }
        }

        this.scene.traverse((obj) => {
            if (!obj.isMesh || !obj.visible || protectedObjects.has(obj)) return;
            box.setFromObject(obj);
            if (box.isEmpty()) return;
            box.getCenter(center);
            box.getSize(size);
            if (center.x > 8.5 && Math.max(size.x, size.y, size.z) < 2.2) {
                this.exteriorSmallProps.push({
                    mesh: obj,
                    x: center.x,
                    z: center.z
                });
            }
        });
    }

    warmupMobileGPU() {
        const saved = [];
        this.scene.traverse((obj) => {
            if (obj.isMesh || obj.isPoints || obj.isLine) {
                saved.push([obj, obj.frustumCulled]);
                obj.frustumCulled = false;
            }
        });
        try {
            this.renderer.compile(this.scene, this.cameraManager.camera);
            this.renderer.render(this.scene, this.cameraManager.camera);
        } catch (err) {
            console.warn('Warm-up GPU ignorado:', err);
        } finally {
            for (const [obj, flag] of saved) {
                obj.frustumCulled = flag;
            }
        }
    }

    async copyInviteLink(button, originalLabel) {
        const inviteUrl = new URL(window.location.href);
        inviteUrl.search = '';
        inviteUrl.hash = '';
        const link = inviteUrl.toString();

        const fallbackCopy = (value) => {
            const field = document.createElement('textarea');
            field.value = value;
            field.setAttribute('readonly', '');
            field.style.position = 'fixed';
            field.style.left = '-9999px';
            field.style.top = '0';
            document.body.appendChild(field);
            field.focus();
            field.select();
            field.setSelectionRange(0, field.value.length);
            let ok = false;
            try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
            field.remove();
            return ok;
        };

        let copied = false;
        if (navigator.clipboard && window.isSecureContext) {
            try {
                await navigator.clipboard.writeText(link);
                copied = true;
            } catch (err) {
                copied = false;
            }
        }
        if (!copied) copied = fallbackCopy(link);

        button.textContent = copied ? 'Link copiado!' : 'Copie o link';
        if (!copied) window.prompt('Copie este link para convidar alguém:', link);

        window.clearTimeout(button._feedbackTimer);
        button._feedbackTimer = window.setTimeout(() => {
            button.textContent = originalLabel;
        }, 1800);
    }

    setupMenu() {
        const menu = document.getElementById('main-menu');
        const btnStart = document.getElementById('btn-start');
        const btnInvite = document.getElementById('btn-invite');
        const nameInput = document.getElementById('player-name');
        this.loadingOverlay = document.getElementById('start-loading');
        this.onlineBadge = document.getElementById('chat-online');

        try {
            nameInput.value = sessionStorage.getItem('loft-nome') || '';
        } catch (err) { /* armazenamento pode estar bloqueado */ }

        const startExperience = () => {
            if (!this.ready || this.started) return;
            const chosenName = (nameInput.value || '').trim().replace(/\s+/g, ' ').slice(0, 20);
            if (!chosenName) {
                nameInput.setCustomValidity('Digite seu nome ou apelido para entrar.');
                nameInput.reportValidity();
                nameInput.focus();
                return;
            }
            nameInput.setCustomValidity('');
            try { sessionStorage.setItem('loft-nome', chosenName); } catch (err) { /* opcional */ }

            this.chat = new Chat(chosenName);
            this.voice = new VoiceChat(chosenName);

            const connectMultiplayer = () => {
                if (this.multiplayer) return;
                this.multiplayer = new MultiplayerManager({
                    scene: this.scene,
                    playerName: chosenName,
                    chat: this.chat,
                    initialState: { x: this.spawn.x, y: 0, z: this.spawn.z, yaw: 0, isSitting: false },
                    onCountChange: (n) => {
                        if (this.onlineBadge) this.onlineBadge.textContent = `${n} online`;
                    }
                });
            };

            if (IS_MOBILE) {
                window.setTimeout(connectMultiplayer, 400);
            } else {
                connectMultiplayer();
            }

            this.started = true;
            if (this.touch) this.touch.show();
            if (this.loadingOverlay) this.loadingOverlay.classList.add('active');
            btnStart.disabled = true;
            menu.style.display = 'none';
            this.container.classList.add('visible');

            this.onWindowResize();

            this.player.unlockAudio();
            try {
                this.tvPyramid.playAudio();
                if (IS_MOBILE) {
                    this.scene.traverse((obj) => {
                        if (obj.isPositionalAudio && obj.panner) {
                            obj.panner.panningModel = 'equalpower';
                        }
                    });
                }
            } catch (e) { console.warn(e); }

            if (!IS_MOBILE) {
                this.cameraManager.lock();
            }

            if (this.prompt) this.prompt.classList.add('hidden');

            requestAnimationFrame(() => {
                if (IS_MOBILE) {
                    this.warmupMobileGPU();
                }
                this.clock.getDelta();
                this.render();
            });
        };

        btnStart.addEventListener('click', startExperience);
        nameInput.addEventListener('input', () => nameInput.setCustomValidity(''));
        nameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') startExperience();
        });

        btnInvite.addEventListener('click', () => this.copyInviteLink(btnInvite, 'Convidar'));
    }

    setupPause() {
        this.pauseMenu = document.getElementById('pause-menu');
        const btnResume = document.getElementById('btn-resume');
        const btnPauseInvite = document.getElementById('btn-pause-invite');
        const btnExit = document.getElementById('btn-exit-menu');
        const roomLabel = document.getElementById('pause-room-label');

        if (roomLabel) roomLabel.textContent = 'Sala: ' + MultiplayerManager.getRoomId();

        const isTyping = () => {
            const el = document.activeElement;
            return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
        };

        document.addEventListener('pointerlockchange', () => {
            if (document.pointerLockElement) return;
            if (!this.started || this.paused || window.__loftFrozen || isTyping()) return;
            this.pause();
        });

        window.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape' || e.repeat) return;
            if (!this.started || this.paused || window.__loftFrozen || isTyping()) return;
            this.pause();
        }, true);

        btnResume.addEventListener('click', () => this.resume());
        btnPauseInvite.addEventListener('click', () => this.copyInviteLink(btnPauseInvite, 'Copiar link da sala'));
        btnExit.addEventListener('click', () => {
            if (this.multiplayer) this.multiplayer.disconnect();
            window.location.reload();
        });
    }

    pause() {
        if (!this.started || this.paused) return;
        this.paused = true;
        window.__loftFrozen = true;
        window.dispatchEvent(new CustomEvent('loft-freeze'));
        if (this.voice) this.voice.stopTalking();
        if (document.pointerLockElement) document.exitPointerLock();
        this.pauseMenu.hidden = false;
    }

    resume() {
        if (!this.paused) return;
        this.paused = false;
        window.__loftFrozen = false;
        this.pauseMenu.hidden = true;
        this.clock.getDelta();
        if (!IS_MOBILE) this.cameraManager.lock();
    }

    onWindowResize() {
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        if (IS_MOBILE) {
            this.renderer.setPixelRatio(this.mobilePixelRatio);
        }
        this.cameraManager.camera.aspect = window.innerWidth / window.innerHeight;
        this.cameraManager.camera.updateProjectionMatrix();
    }

    render() {
        if (!this.started) return;

        requestAnimationFrame(() => this.render());

        if (document.hidden) return;

        const rawDelta = this.clock.getDelta();
        const deltaTime = Math.min(rawDelta, 0.1);
        this.frameCount++;

        if (!this.paused) {
            this.player.update(deltaTime);
            this.cameraManager.update(deltaTime);

            if (IS_MOBILE) {
                if (this.world.updateMobileGlass) {
                    this.world.updateMobileGlass(this.player.group.position.x);
                }

                if (this.exteriorSmallProps.length > 0 && this.frameCount % 6 === 0) {
                    const px = this.player.group.position.x;
                    const pz = this.player.group.position.z;
                    const maxDistSq = 40 * 40;
                    for (let i = 0; i < this.exteriorSmallProps.length; i++) {
                        const item = this.exteriorSmallProps[i];
                        const dx = item.x - px;
                        const dz = item.z - pz;
                        item.mesh.visible = (dx * dx + dz * dz) <= maxDistSq;
                    }
                }
            }

            if (!IS_MOBILE) {
                this.tvPyramid.update(this.player.group.position);
                this.projector.update(this.player.group.position);
                this.meetingRoom.update(this.player.group.position);
            } else {
                const slot = this.frameCount % 4;
                if (slot === 0) this.tvPyramid.update(this.player.group.position);
                else if (slot === 1) this.projector.update(this.player.group.position);
                else if (slot === 2) this.meetingRoom.update(this.player.group.position);
            }
        }

        if (this.multiplayer) {
            const p = this.player.group.position;
            this.multiplayer.update(deltaTime, {
                x: p.x,
                y: p.y,
                z: p.z,
                yaw: this.cameraManager.yaw,
                isSitting: this.player.isSitting
            });
        }

        this.renderer.render(this.scene, this.cameraManager.camera);

        if (this.loadingOverlay) {
            this.loadingOverlay.classList.remove('active');
            this.loadingOverlay = null;
        }
    }
}

new Experience();