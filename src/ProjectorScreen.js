import * as THREE from 'three';

// Controlador de compartilhamento usado pelo projetor do loft e pela TV da reunião.
// Pressione E próximo a qualquer uma das telas para iniciar/parar a transmissão.
export class ProjectorScreen {
    constructor(scene, position = new THREE.Vector3(-7.85, 2.1, 3.5)) {
        this.scene = scene;
        this.streaming = false;
        this.requesting = false;
        this.stream = null;
        this.screens = [];
        this.noticeUntil = 0;
        this.noticeText = '';

        this.video = document.createElement('video');
        this.video.muted = true;
        this.video.playsInline = true;
        this.video.autoplay = true;
        this.video.style.display = 'none';
        document.body.appendChild(this.video);

        this.texture = new THREE.VideoTexture(this.video);
        this.texture.colorSpace = THREE.SRGBColorSpace;

        this.offMaterial = new THREE.MeshBasicMaterial({
            color: 0x0b0d10, side: THREE.DoubleSide, toneMapped: false
        });
        this.activeMaterial = new THREE.MeshBasicMaterial({
            map: this.texture, side: THREE.DoubleSide, toneMapped: false
        });

        this.screen = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 2.4), this.offMaterial);
        this.screen.position.copy(position);
        this.screen.rotation.y = Math.PI / 2;
        scene.add(this.screen);
        this.screens.push(this.screen);

        const frameMat = new THREE.MeshStandardMaterial({
            color: 0x0a0a0a, roughness: 0.5, metalness: 0.45
        });
        const mk = (w, h, x, y, z) => {
            const f = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.08), frameMat);
            f.position.set(position.x + 0.03, position.y + y, position.z + x);
            scene.add(f);
        };
        mk(4.4, 0.1, 0, 1.25, 0);
        mk(4.4, 0.1, 0, -1.25, 0);
        mk(0.1, 2.6, 2.15, 0, 0);
        mk(0.1, 2.6, -2.15, 0, 0);

        this.hint = document.createElement('div');
        this.hint.style.cssText = [
            'position:fixed', 'bottom:12vh', 'left:50%',
            'transform:translateX(-50%)', 'background:rgba(0,0,0,0.72)',
            'color:#fff', 'padding:10px 18px', 'border-radius:8px',
            'font:14px sans-serif', 'display:none', 'z-index:10',
            'border:1px solid rgba(210,210,210,0.18)'
        ].join(';') + ';';
        this.hint.textContent = '[E] — transmitir tela nesta sala';
        document.body.appendChild(this.hint);

        this.near = false;
        window.addEventListener('keydown', (e) => {
            if (e.repeat || e.key.toLowerCase() !== 'e' || !this.near) return;
            e.preventDefault();
            if (this.streaming) this.stop();
            else this.start();
        });
    }

    addMirrorScreen(screen) {
        if (!screen || this.screens.includes(screen)) return;
        this.screens.push(screen);
        screen.material = this.streaming ? this.activeMaterial : this.offMaterial;
    }

    showNotice(message, duration = 4500) {
        this.noticeText = message;
        this.noticeUntil = Date.now() + duration;
        this.hint.textContent = message;
        this.hint.style.display = 'block';
    }

    async start() {
        if (this.streaming || this.requesting) return;

        const mediaDevices = navigator.mediaDevices;
        if (!mediaDevices || typeof mediaDevices.getDisplayMedia !== 'function') {
            this.showNotice('Compartilhamento exige HTTPS ou localhost.');
            return;
        }

        this.requesting = true;
        this.showNotice('Selecione a tela ou janela que deseja transmitir...');
        try {
            // A chamada ocorre diretamente no evento de teclado (gesto do usuário).
            const stream = await mediaDevices.getDisplayMedia({
                video: { frameRate: { ideal: 30, max: 30 } },
                audio: false
            });
            this.stream = stream;
            this.video.srcObject = stream;
            await this.video.play();

            this.screens.forEach((screen) => {
                screen.material = this.activeMaterial;
            });
            this.streaming = true;
            this.noticeUntil = 0;
            this.noticeText = '';
            this.updateHintText();

            stream.getVideoTracks().forEach((track) => {
                track.addEventListener('ended', () => this.stop());
            });
        } catch (err) {
            console.warn('Espelhamento cancelado/falhou:', err);
            this.showNotice(
                err && err.name === 'NotAllowedError'
                    ? 'Compartilhamento cancelado. Pressione E para tentar novamente.'
                    : 'Não foi possível iniciar a transmissão. Verifique a permissão do navegador.'
            );
        } finally {
            this.requesting = false;
        }
    }

    stop() {
        if (this.stream) {
            this.stream.getTracks().forEach((track) => track.stop());
            this.stream = null;
        }
        this.video.pause();
        this.video.srcObject = null;
        this.screens.forEach((screen) => {
            screen.material = this.offMaterial;
        });
        this.streaming = false;
        this.noticeUntil = 0;
        this.noticeText = '';
        this.updateHintText();
    }

    updateHintText() {
        this.hint.textContent = this.streaming
            ? '[E] — parar transmissão nas telas'
            : '[E] — transmitir sua tela nesta sala';
    }

    update(playerPos) {
        let closest = Infinity;
        for (const screen of this.screens) {
            const distance = screen.position.distanceTo(playerPos);
            if (distance < closest) closest = distance;
        }
        this.near = closest < 4.5;

        const showingNotice = Date.now() < this.noticeUntil;
        if (showingNotice) {
            this.hint.textContent = this.noticeText;
            this.hint.style.display = 'block';
        } else {
            if (this.near) this.updateHintText();
            this.hint.style.display = this.near ? 'block' : 'none';
        }
    }
}
