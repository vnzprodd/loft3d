import * as THREE from 'three';
import { World } from './World.js';
import { Player } from './Player.js';
import { CameraManager } from './CameraManager.js';
import { TVPyramid } from './TVPyramid.js';
import { ProjectorScreen } from './ProjectorScreen.js';
import { MeetingRoom } from './MeetingRoom.js';
import { Chat } from './Chat.js';
import { VoiceChat } from './VoiceChat.js';

class Experience {
    constructor() {
        this.container = document.getElementById('app');
        this.prompt = document.getElementById('audio-prompt');
        this.started = false;

        this.scene = new THREE.Scene();
        // sky (the loft now opens onto a balcony + beach)
        this.scene.background = new THREE.Color(0x87b5dd);
        this.scene.fog = new THREE.FogExp2(0x87b5dd, 0.006);

        this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        // Um limite moderado de DPR reduz o custo de GPU em telas de alta densidade.
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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
        // mostra qualquer erro na tela (antes de montar o resto)
        window.addEventListener('error', (e) => this.showError(e.message));
        window.addEventListener('unhandledrejection', (e) => this.showError(String(e.reason && e.reason.stack || e.reason)));

        try {
            this.build();
        } catch (err) {
            this.showError(err && err.stack ? err.stack : String(err));
            return;
        }
        this.ready = true;
        // Pré-compila shaders em segundo plano para reduzir a primeira travada ao entrar.
        if (typeof this.renderer.compileAsync === 'function') {
            this.renderer.compileAsync(this.scene, this.cameraManager.camera)
                .catch((err) => console.warn('Pré-compilação gráfica ignorada:', err));
        }
    }

    build() {
        // Initialize Menu
        this.setupMenu();

        // Initialize World
        this.world = new World(this.scene);

        // Initialize Player (world provides colliders + walkable heights)
        this.player = new Player(this.scene);
        this.player.world = this.world;
        this.player.group.position.set(0, 0, 6);   // espaço livre no meio do loft

        // Initialize Camera and link it to the player for camera-relative movement
        this.cameraManager = new CameraManager(this.scene, this.player, this.renderer.domElement);
        this.player.camera = this.cameraManager.camera;

        // Initialize TV Pyramid
        // TV pyramid in the room corner (registers its own collider)
        this.tvPyramid = new TVPyramid(this.scene, new THREE.Vector3(-6.8, 0, 7.5), this.world.colliders);
        this.tvPyramid.setListener(this.cameraManager.camera);

        // projector screen on the left wall (E to mirror the notebook)
        this.projector = new ProjectorScreen(this.scene);

        // sala de reuniao atras da porta (z=-10) com o quadro branco desenhável
        this.meetingRoom = new MeetingRoom(this.scene, this.world);
        this.world.meetingRoom = this.meetingRoom;
        // A TV da sala de reunião compartilha a mesma fonte de transmissão do projetor.
        this.projector.addMirrorScreen(this.meetingRoom.transmissionScreen);

        // Chat e voz são iniciados depois que o visitante confirma o apelido no menu.
        window.addEventListener('resize', () => this.onWindowResize());
    }

    setupMenu() {
        const menu = document.getElementById('main-menu');
        const btnStart = document.getElementById('btn-start');
        const btnInvite = document.getElementById('btn-invite');
        const nameInput = document.getElementById('player-name');
        this.loadingOverlay = document.getElementById('start-loading');

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
            this.started = true;
            if (this.loadingOverlay) this.loadingOverlay.classList.add('active');
            btnStart.disabled = true;
            menu.style.display = 'none';
            this.container.classList.add('visible');

            // Force resize to ensure the canvas fills the screen correctly
            this.onWindowResize();

            // Unlock audio and start music only now
            this.player.unlockAudio();
            try { this.tvPyramid.playAudio(); } catch (e) { console.warn(e); }
            this.cameraManager.lock();   // prende o mouse para olhar em volta

            // Remove the old prompt since we have a menu
            if (this.prompt) this.prompt.classList.add('hidden');

            // Evita um delta enorme caso o menu tenha ficado aberto por muito tempo.
            this.clock.getDelta();

            // Dá ao navegador um instante para pintar o indicador antes do primeiro frame 3D.
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

        btnInvite.addEventListener('click', async () => {
            // Usa a URL real da hospedagem (inclusive o subcaminho do GitHub Pages).
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
                let copied = false;
                try { copied = document.execCommand('copy'); } catch (err) { copied = false; }
                field.remove();
                return copied;
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

            const originalLabel = 'Convidar';
            btnInvite.textContent = copied ? 'Link copiado!' : 'Copie o link';
            if (!copied) {
                // Último recurso caso o navegador bloqueie as duas formas de cópia.
                window.prompt('Copie este link para convidar alguém:', link);
            }
            window.clearTimeout(this.inviteFeedbackTimer);
            this.inviteFeedbackTimer = window.setTimeout(() => {
                btnInvite.textContent = originalLabel;
            }, 1800);
        });
    }

    onWindowResize() {
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.cameraManager.camera.aspect = window.innerWidth / window.innerHeight;
        this.cameraManager.camera.updateProjectionMatrix();
    }

    render() {
        if (!this.started) return;

        const deltaTime = this.clock.getDelta();

        this.player.update(deltaTime);
        this.cameraManager.update(deltaTime);
        this.tvPyramid.update(this.player.group.position);
        this.projector.update(this.player.group.position);
        this.meetingRoom.update(this.player.group.position);

        this.renderer.render(this.scene, this.cameraManager.camera);

        // O primeiro frame 3D já foi desenhado; libera o indicador de carregamento.
        if (this.loadingOverlay && this.loadingOverlay.classList.contains('active')) {
            this.loadingOverlay.classList.remove('active');
        }

        requestAnimationFrame(() => this.render());
    }
}

new Experience();
