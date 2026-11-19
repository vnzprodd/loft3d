import * as THREE from 'three';

const isMobileDevice = () =>
    typeof window !== 'undefined' &&
    (window.matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent));

export class CameraManager {
    constructor(scene, player, domElement = document.body) {
        this.scene = scene;
        this.player = player;
        this.dom = domElement;
        const isMobile = isMobileDevice();

        this.camera = new THREE.PerspectiveCamera(
            75,
            window.innerWidth / window.innerHeight,
            0.1,
            isMobile ? 150 : 600
        );
        this.scene.add(this.camera);

        this.yaw = 0;
        this.pitch = 0;
        this.sensitivity = 0.0022;
        this.eyeHeight = 1.55;
        this.sitEyeHeight = 1.15;
        this.arrows = { left: false, right: false, up: false, down: false };

        this.onMouseMove = (e) => {
            if (document.pointerLockElement !== this.dom) return;
            this.yaw -= e.movementX * this.sensitivity;
            this.pitch -= e.movementY * this.sensitivity;
            this.pitch = THREE.MathUtils.clamp(this.pitch, -1.45, 1.45);
        };
        document.addEventListener('mousemove', this.onMouseMove);

        this.dom.addEventListener('click', () => {
            if (!window.__loftFrozen && !this.isTyping()) this.lock();
        });

        window.addEventListener('keydown', (e) => {
            if (this.isTyping() || window.__loftFrozen) return;
            if (e.key === 'ArrowLeft') this.arrows.left = true;
            if (e.key === 'ArrowRight') this.arrows.right = true;
            if (e.key === 'ArrowUp') this.arrows.up = true;
            if (e.key === 'ArrowDown') this.arrows.down = true;
        });
        window.addEventListener('keyup', (e) => {
            if (e.key === 'ArrowLeft') this.arrows.left = false;
            if (e.key === 'ArrowRight') this.arrows.right = false;
            if (e.key === 'ArrowUp') this.arrows.up = false;
            if (e.key === 'ArrowDown') this.arrows.down = false;
        });

        this.applyRotation();
    }

    isTyping() {
        const el = document.activeElement;
        return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
    }

    lock() {
        try {
            const r = this.dom.requestPointerLock();
            if (r && r.catch) r.catch(() => {});
        } catch (err) {
            console.warn('Não foi possível prender o mouse:', err);
        }
    }

    applyRotation() {
        this.camera.rotation.order = 'YXZ';
        this.camera.rotation.set(this.pitch, this.yaw, 0);
    }

    update(dt) {
        const turn = 1.8 * dt;
        if (this.arrows.left) this.yaw += turn;
        if (this.arrows.right) this.yaw -= turn;
        if (this.arrows.up) this.pitch = Math.min(1.45, this.pitch + turn);
        if (this.arrows.down) this.pitch = Math.max(-1.45, this.pitch - turn);

        const p = this.player.group.position;
        const eye = this.player.isSitting ? this.sitEyeHeight : this.eyeHeight;
        this.camera.position.set(p.x, p.y + eye, p.z);
        this.applyRotation();

        if (!this.player.isSitting) this.player.group.rotation.y = this.yaw;
    }
}