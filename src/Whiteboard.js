import * as THREE from 'three';

// Quadro branco: o mesmo canvas 2D e' a textura do quadro em 3D e a area de desenho
// do editor em tela cheia, entao o que voce desenha aparece na parede na hora.
export class Whiteboard {
    constructor(scene, opts = {}) {
        this.scene = scene;
        this.width = opts.width ?? 4.6;
        this.height = opts.height ?? 2.3;
        this.position = opts.position ? opts.position.clone() : new THREE.Vector3(4.25, 1.95, -16.85);
        this.rotationY = opts.rotationY ?? 0;

        this.isOpen = false;
        this.near = false;
        this.color = '#111111';
        this.size = 8;
        this.erasing = false;
        this.drawing = false;
        this.last = null;
        this.armClear = false;
        this.armTimer = null;

        this.root = document.getElementById('board-ui');
        this.canvas = document.getElementById('board-canvas');
        this.ctx = this.canvas.getContext('2d');

        this.clearBoard();

        this.texture = new THREE.CanvasTexture(this.canvas);
        this.texture.colorSpace = THREE.SRGBColorSpace;
        this.texture.anisotropy = 8;

        this.mesh = new THREE.Mesh(
            new THREE.PlaneGeometry(this.width, this.height),
            new THREE.MeshBasicMaterial({ map: this.texture })
        );
        this.mesh.position.copy(this.position);
        this.mesh.rotation.y = this.rotationY;
        this.scene.add(this.mesh);

        this.buildFrame();
        this.buildHint();
        this.buildTray();
        this.bindToolbar();
        this.bindDrawing();
        this.bindKeys();
    }

    buildFrame() {
        const frameMat = new THREE.MeshStandardMaterial({ color: 0xb6bcc2, roughness: 0.35, metalness: 0.65 });
        const t = 0.07;
        const mk = (w, h, dx, dy) => {
            const f = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.06), frameMat);
            const off = new THREE.Vector3(dx, dy, -0.035).applyEuler(new THREE.Euler(0, this.rotationY, 0));
            f.position.copy(this.position).add(off);
            f.rotation.y = this.rotationY;
            this.scene.add(f);
        };
        mk(this.width + t * 2, t, 0, this.height / 2 + t / 2);
        mk(this.width + t * 2, t, 0, -this.height / 2 - t / 2);
        mk(t, this.height, this.width / 2 + t / 2, 0);
        mk(t, this.height, -this.width / 2 - t / 2, 0);
    }

    // Bandeja de canetas presa embaixo do quadro
    buildTray() {
        const trayMat = new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.6, metalness: 0.4 });
        const off = new THREE.Vector3(0, -this.height / 2 - 0.16, 0.09).applyEuler(new THREE.Euler(0, this.rotationY, 0));
        const tray = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.05, 0.16), trayMat);
        tray.position.copy(this.position).add(off);
        tray.rotation.y = this.rotationY;
        tray.castShadow = true;
        this.scene.add(tray);

        const penColors = [0x141414, 0xe01b24, 0x1c71d8, 0x2ec27e];
        penColors.forEach((c, i) => {
            const pen = new THREE.Mesh(
                new THREE.CylinderGeometry(0.018, 0.018, 0.34, 8),
                new THREE.MeshStandardMaterial({ color: c, roughness: 0.5 })
            );
            const px = -0.5 + i * 0.32;
            const po = new THREE.Vector3(px, -this.height / 2 - 0.1, 0.09).applyEuler(new THREE.Euler(0, this.rotationY, 0));
            pen.position.copy(this.position).add(po);
            pen.rotation.set(Math.PI / 2, 0, 0);
            pen.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), this.rotationY);
            this.scene.add(pen);
        });
    }

    buildHint() {
        this.hint = document.createElement('div');
        this.hint.className = 'hint';
        this.hint.textContent = '[Q] — abrir o quadro branco para desenhar';
        document.body.appendChild(this.hint);
    }

    clearBoard() {
        const { width: w, height: h } = this.canvas;
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.globalCompositeOperation = 'source-over';
        this.ctx.fillStyle = '#ffffff';
        this.ctx.fillRect(0, 0, w, h);
        // brilho suave de quadro novo
        const grd = this.ctx.createLinearGradient(0, 0, w, h);
        grd.addColorStop(0, 'rgba(0,0,0,0.03)');
        grd.addColorStop(0.5, 'rgba(0,0,0,0)');
        grd.addColorStop(1, 'rgba(0,0,0,0.03)');
        this.ctx.fillStyle = grd;
        this.ctx.fillRect(0, 0, w, h);
        if (this.texture) this.texture.needsUpdate = true;
    }

    bindToolbar() {
        this.root.querySelectorAll('.pen').forEach(btn => {
            btn.addEventListener('click', () => {
                this.color = btn.dataset.color;
                this.erasing = false;
                this.resetArmedClear();
                this.root.querySelectorAll('.pen').forEach(b => b.classList.toggle('active', b === btn));
                this.root.querySelector('#board-eraser').classList.remove('active');
            });
        });

        this.root.querySelectorAll('.size').forEach(btn => {
            btn.addEventListener('click', () => {
                this.size = Number(btn.dataset.size);
                this.root.querySelectorAll('.size').forEach(b => b.classList.toggle('active', b === btn));
            });
        });

        const eraser = this.root.querySelector('#board-eraser');
        eraser.addEventListener('click', () => {
            this.erasing = !this.erasing;
            this.resetArmedClear();
            eraser.classList.toggle('active', this.erasing);
            this.root.querySelectorAll('.pen').forEach(b => b.classList.toggle('active', false));
        });

        this.clearBtn = this.root.querySelector('#board-clear');
        this.clearBtn.addEventListener('click', () => {
            if (!this.armClear) {
                this.armClear = true;
                this.clearBtn.classList.add('armed');
                this.clearBtn.textContent = 'Apagar tudo?';
                this.armTimer = setTimeout(() => this.resetArmedClear(), 3000);
                return;
            }
            this.clearBoard();
            this.resetArmedClear();
        });

        this.root.querySelector('#board-close').addEventListener('click', () => this.close());
    }

    resetArmedClear() {
        if (!this.clearBtn) return;
        clearTimeout(this.armTimer);
        this.armClear = false;
        this.clearBtn.classList.remove('armed');
        this.clearBtn.textContent = 'Limpar';
    }

    bindDrawing() {
        const c = this.canvas;

        const pos = (e) => {
            const r = c.getBoundingClientRect();
            return {
                x: (e.clientX - r.left) / r.width * c.width,
                y: (e.clientY - r.top) / r.height * c.height
            };
        };

        const stroke = () => {
            const ctx = this.ctx;
            ctx.globalCompositeOperation = 'source-over';
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.strokeStyle = this.erasing ? '#ffffff' : this.color;
            ctx.lineWidth = this.erasing ? this.size * 3.5 : this.size;
        };

        const updateTexture = () => {
            if (this.texture) {
                this.texture.needsUpdate = true;
            }
        };

        c.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            c.setPointerCapture(e.pointerId);
            this.drawing = true;
            this.last = pos(e);
            stroke();
            // ponto isolado (clique sem arrastar)
            const p = this.last;
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, this.ctx.lineWidth / 2, 0, Math.PI * 2);
            this.ctx.fillStyle = this.erasing ? '#ffffff' : this.color;
            this.ctx.fill();
            updateTexture();
        });

        c.addEventListener('pointermove', (e) => {
            if (!this.drawing) return;
            e.preventDefault();
            const p = pos(e);
            stroke();
            this.ctx.beginPath();
            this.ctx.moveTo(this.last.x, this.last.y);
            this.ctx.lineTo(p.x, p.y);
            this.ctx.stroke();
            this.last = p;

            // Use requestAnimationFrame for texture updates to avoid blocking the main thread
            if (!this.textureUpdatePending) {
                this.textureUpdatePending = true;
                requestAnimationFrame(() => {
                    updateTexture();
                    this.textureUpdatePending = false;
                });
            }
        });

        const end = (e) => {
            if (!this.drawing) return;
            this.drawing = false;
            this.last = null;
            try { c.releasePointerCapture(e.pointerId); } catch (err) { /* ja liberado */ }
        };
        c.addEventListener('pointerup', end);
        c.addEventListener('pointercancel', end);
        c.addEventListener('pointerleave', end);
    }

    bindKeys() {
        window.addEventListener('keydown', (e) => {
            if (e.repeat) return;
            const el = document.activeElement;
            const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);

            if (e.key === 'Escape' && this.isOpen) {
                this.close();
                return;
            }
            if (typing) return;
            if (e.key.toLowerCase() !== 'q') return;
            if (this.isOpen) this.close();
            else if (this.near) this.open();
        });
    }

    open() {
        if (this.isOpen) return;
        this.isOpen = true;
        this.freeze(true);
        this.root.hidden = false;
        this.hint.style.display = 'none';
        if (document.pointerLockElement) document.exitPointerLock();
    }

    close() {
        if (!this.isOpen) return;
        this.isOpen = false;
        this.freeze(false);
        this.root.hidden = true;
        this.resetArmedClear();
    }

    freeze(value) {
        window.__loftFrozen = value;
        if (value) window.dispatchEvent(new CustomEvent('loft-freeze'));
    }

    update(playerPos) {
        const d = this.position.distanceTo(playerPos);
        this.near = d < 5.5;
        this.hint.style.display = (this.near && !this.isOpen) ? 'block' : 'none';
    }
}
