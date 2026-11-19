import * as THREE from 'three';
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
    (window.matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent));

class Experience {
    constructor() {
        this.container = document.getElementById('app');
        this.prompt = document.getElementById('audio-prompt');
        this.started = false;
        this.paused = false;
        this.frameCount = 0;
        this.mobilePixelRatio = 0.65;
        this.slowFrames = 0;

        if (IS_MOBILE && document.body) {
            document.body.classList.add('is-mobile');
        }

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87b5dd);
        this.scene.fog = new THREE.FogExp2(0x87b5dd, IS_MOBILE ? 0.0085 : 0.006);

        this.renderer = new THREE.WebGLRenderer({
            antialias: !IS_MOBILE,
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

    optimizeSceneForMobile() {
        const materialCache = new Map();
        const lightsToRemove = [];
        let keptPointLights = 0;

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

        const convertMaterial = (mat) => {
            if (!mat) return mat;
            if (materialCache.has(mat)) return materialCache.get(mat);

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

                materialCache.set(mat, fastMat);
                mat.dispose();
                return fastMat;
            }

            optimizeTexture(mat.map);
            optimizeTexture(mat.emissiveMap);
            materialCache.set(mat, mat);
            return mat;
        };

        this.scene.traverse((obj) => {
            obj.castShadow = false;
            obj.receiveShadow = false;

            if (obj.isLight) {
                if (obj.isAmbientLight || obj.isHemisphereLight) {
                    obj.intensity *= 1.35;
                } else if (obj.isDirectionalLight) {
                    obj.castShadow = false;
                } else if (obj.isSpotLight) {
                    lightsToRemove.push(obj);
                } else if (obj.isPointLight) {
                    if (keptPointLights < 2) {
                        keptPointLights++;
                    } else {
                        lightsToRemove.push(obj);
                    }
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

            this.multiplayer = new MultiplayerManager({
                scene: this.scene,
                playerName: chosenName,
                chat: this.chat,
                initialState: { x: this.spawn.x, y: 0, z: this.spawn.z, yaw: 0, isSitting: false },
                onCountChange: (n) => {
                    if (this.onlineBadge) this.onlineBadge.textContent = `${n} online`;
                }
            });

            this.started = true;
            if (this.touch) this.touch.show();
            if (this.loadingOverlay) this.loadingOverlay.classList.add('active');
            btnStart.disabled = true;
            menu.style.display = 'none';
            this.container.classList.add('visible');

            this.onWindowResize();

            this.player.unlockAudio();
            try { this.tvPyramid.playAudio(); } catch (e) { console.warn(e); }
            this.cameraManager.lock();

            if (this.prompt) this.prompt.classList.add('hidden');

            this.clock.getDelta();

            setTimeout(() => {
                this.clock.getDelta();
                this.render();
            }, 120);
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
        this.cameraManager.lock();
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

        // Ajuste automático se o celular cair abaixo de ~22 FPS
        if (IS_MOBILE && !this.paused && this.mobilePixelRatio > 0.5) {
            if (rawDelta > 0.045) {
                this.slowFrames++;
                if (this.slowFrames > 45) {
                    this.slowFrames = 0;
                    this.mobilePixelRatio = 0.52;
                    this.renderer.setPixelRatio(this.mobilePixelRatio);
                }
            } else {
                this.slowFrames = Math.max(0, this.slowFrames - 1);
            }
        }

        if (!this.paused) {
            this.player.update(deltaTime);
            this.cameraManager.update(deltaTime);

            if (!IS_MOBILE || this.frameCount % 2 === 0) {
                this.tvPyramid.update(this.player.group.position);
                this.projector.update(this.player.group.position);
                this.meetingRoom.update(this.player.group.position);
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

        if (this.loadingOverlay && this.loadingOverlay.classList.contains('active')) {
            this.loadingOverlay.classList.remove('active');
        }
    }
}

new Experience();