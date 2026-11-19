import * as THREE from 'three';

export class TVPyramid {
    constructor(scene, position = new THREE.Vector3(-6.8, 0, 7.5), colliders = null) {
        this.scene = scene;
        this.audioListener = new THREE.AudioListener();
        this.group = new THREE.Group();
        this.group.position.copy(position);

        this.createPyramid();
        this.setupAudio(position);
        this.scene.add(this.group);

        if (colliders) {
            colliders.push({ minX: position.x - 0.9, maxX: position.x + 0.9, minZ: position.z - 0.9, maxZ: position.z + 0.9, minY: 0 });
        }
    }

    setListener(camera) {
        camera.add(this.audioListener);
    }

    createPyramid() {
        const tvGeo = new THREE.BoxGeometry(0.75, 0.58, 0.55);
        const tvBodyMat = new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.5 });
        const screenGeo = new THREE.PlaneGeometry(0.58, 0.44);

        // each TV gets its own slightly different glowing screen
        const levels = 3;
        for (let l = 0; l < levels; l++) {
            const count = levels - l;
            for (let i = 0; i < count; i++) {
                const tv = new THREE.Mesh(tvGeo, tvBodyMat);
                tv.position.set((i - (count - 1) / 2) * 0.82, l * 0.6 + 0.29, 0);
                tv.rotation.y = (Math.random() - 0.5) * 0.25;
                tv.castShadow = tv.receiveShadow = true;

                const hue = Math.random() > 0.5 ? 0x33ffcc : 0x88aaff;
                const screenMat = new THREE.MeshBasicMaterial({ color: hue });
                const screen = new THREE.Mesh(screenGeo, screenMat);
                screen.position.set(0.03, 0.03, 0.28);
                tv.add(screen);

                // small knobs
                const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.03, 8), new THREE.MeshStandardMaterial({ color: 0x111111 }));
                knob.rotation.x = Math.PI / 2;
                knob.position.set(-0.2, -0.12, 0.28);
                tv.add(knob);

                this.group.add(tv);
            }
        }
    }

    setupAudio(position) {
        this.sound = new THREE.PositionalAudio(this.audioListener);
        this.audioLoader = new THREE.AudioLoader();

        this.audioLoader.load('/videoplayback.mp3', (buffer) => {
            this.sound.setBuffer(buffer);
            this.sound.setLoop(true);
            this.sound.setVolume(0.35);
            this.sound.setRefDistance(1.5);
            this.sound.setRolloffFactor(1.8);
            this.sound.setDistanceModel('exponential');
            this.loaded = true;
        }, undefined, (err) => {
            this.loadError = true;
            console.error('Falha ao carregar videoplayback.mp3:', err);
            const el = document.createElement('div');
            el.style.cssText = 'position:fixed;bottom:10px;right:10px;background:#600;color:#fff;padding:8px 12px;font:12px monospace;z-index:99;';
            el.textContent = 'ERRO: videoplayback.mp3 não encontrado em /public';
            document.body.appendChild(el);
        });

        this.group.add(this.sound);

        // interaction hint "[F] play/pause"
        this.hint = document.createElement('div');
        this.hint.style.cssText = 'position:fixed;bottom:12vh;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.65);color:#fff;padding:10px 18px;border-radius:8px;font:14px sans-serif;display:none;z-index:10;';
        this.hint.textContent = '[F] — tocar / pausar a música';
        document.body.appendChild(this.hint);
        this.near = false;

        window.addEventListener('keydown', (e) => {
            if (e.key.toLowerCase() !== 'f' || !this.near) return;
            if (!this.loaded) { this.playAudio(); return; }
            if (this.sound.isPlaying) this.sound.pause();
            else this.playAudio();
        });
    }

    update(playerPos) {
        const d = this.group.position.distanceTo(playerPos);
        this.near = d < 4.5;
        this.hint.style.display = this.near ? 'block' : 'none';
    }

    playAudio() {
        if (this.loadError) return;
        // browsers block audio until a user gesture: resume the context first
        if (this.audioListener.context.state === 'suspended') {
            this.audioListener.context.resume();
        }
        if (this.loaded && !this.sound.isPlaying) {
            this.sound.play();
        }
    }
}
