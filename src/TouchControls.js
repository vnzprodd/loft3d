// Controles para celular/tablet:
//  - analógico no canto inferior esquerdo (andar)
//  - arrastar o dedo na tela (olhar em volta)
//  - botões: pular, sentar/música (F), usar (E), quadro (Q), microfone (segurar) e pausa
// No PC nada muda: este módulo só aparece quando detecta toque.

const STYLE = `
#tc-root { position: fixed; inset: 0; z-index: 30; pointer-events: none; display: none; }
#tc-root > * { pointer-events: auto; touch-action: none; }

#tc-stick {
    position: absolute;
    left: calc(22px + env(safe-area-inset-left, 0px));
    bottom: calc(22px + env(safe-area-inset-bottom, 0px));
    width: 140px; height: 140px; border-radius: 50%;
    background: rgba(255, 255, 255, 0.08);
    border: 2px solid rgba(255, 255, 255, 0.28);
    backdrop-filter: blur(4px);
}
#tc-knob {
    position: absolute; left: 50%; top: 50%;
    width: 60px; height: 60px; margin: -30px 0 0 -30px; border-radius: 50%;
    background: rgba(255, 255, 255, 0.38);
    border: 2px solid rgba(255, 255, 255, 0.6);
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.45);
    pointer-events: none;
}

#tc-actions {
    position: absolute;
    right: calc(14px + env(safe-area-inset-right, 0px));
    bottom: calc(64px + env(safe-area-inset-bottom, 0px));
    display: flex; flex-direction: column; align-items: flex-end; gap: 12px;
    pointer-events: none;
}
#tc-actions > * { pointer-events: auto; }
.tc-row { display: flex; gap: 10px; }

.tc-btn {
    width: 48px; height: 48px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center; flex-direction: column;
    background: rgba(16, 17, 20, 0.7);
    border: 1px solid rgba(255, 255, 255, 0.3);
    color: #f2f3f5; font: 700 15px/1 'Segoe UI', sans-serif;
    padding: 0; cursor: pointer; touch-action: none;
    -webkit-tap-highlight-color: transparent;
}
.tc-btn small { font-size: 8px; font-weight: 600; opacity: 0.7; margin-top: 2px; letter-spacing: 0.4px; text-transform: uppercase; }
.tc-btn:active, .tc-btn.down { background: rgba(215, 25, 32, 0.75); border-color: #d71920; }
#tc-jump { width: 76px; height: 76px; font-size: 13px; letter-spacing: 0.8px; }

#tc-pause {
    position: absolute;
    top: calc(12px + env(safe-area-inset-top, 0px));
    right: calc(12px + env(safe-area-inset-right, 0px));
    width: 42px; height: 42px; font-size: 13px;
}

/* ajustes do resto da interface quando está no celular */
body.touch-mode { overscroll-behavior: none; -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }
body.touch-mode input, body.touch-mode textarea { -webkit-user-select: text; user-select: text; }
body.touch-mode canvas { touch-action: none; }
body.touch-mode .instructions { display: none; }
body.touch-mode #voice-pill {
    left: auto; right: calc(14px + env(safe-area-inset-right, 0px));
    bottom: calc(14px + env(safe-area-inset-bottom, 0px));
    justify-content: flex-start; padding: 8px 12px; font-size: 12px;
}
body.touch-mode #voice-roster {
    left: auto; right: calc(14px + env(safe-area-inset-right, 0px));
    bottom: calc(54px + env(safe-area-inset-bottom, 0px)); text-align: right;
}
`;

export class TouchControls {
    constructor({ player, cameraManager, dom, onPause }) {
        this.player = player;
        this.cam = cameraManager;
        this.dom = dom;
        this.onPause = onPause || (() => {});

        this.stick = { x: 0, y: 0 };
        player.touchInput = this.stick;

        this.stickId = null;
        this.lookId = null;
        this.lastX = 0;
        this.lastY = 0;
        this.lookSensitivity = 0.0045;

        this.started = false;   // só aparece depois de clicar em Iniciar
        this.enabled = window.matchMedia('(pointer: coarse)').matches;

        this.injectStyle();
        this.buildUI();
        this.bindStick();
        this.bindLook();

        // aparelho híbrido (notebook com tela touch): ativa ao primeiro toque real
        window.addEventListener('pointerdown', (e) => {
            if (e.pointerType === 'touch' && !this.enabled) {
                this.enabled = true;
                this.apply();
            }
        }, { capture: true, passive: true });

        window.addEventListener('loft-freeze', () => this.resetStick());
    }

    show() {
        this.started = true;
        this.apply();
    }

    apply() {
        const on = this.started && this.enabled;
        this.root.style.display = on ? 'block' : 'none';
        document.body.classList.toggle('touch-mode', on);
    }

    injectStyle() {
        const style = document.createElement('style');
        style.textContent = STYLE;
        document.head.appendChild(style);
    }

    // ---------- interface ----------
    buildUI() {
        this.root = document.createElement('div');
        this.root.id = 'tc-root';

        this.base = document.createElement('div');
        this.base.id = 'tc-stick';
        this.knob = document.createElement('div');
        this.knob.id = 'tc-knob';
        this.base.appendChild(this.knob);

        const actions = document.createElement('div');
        actions.id = 'tc-actions';

        const row = document.createElement('div');
        row.className = 'tc-row';
        row.append(
            this.holdKey('🎤', 'Falar', 'v', 'KeyV', 'Segurar para falar'),
            this.tapKey('Q', 'quadro', 'q', 'KeyQ', 'Abrir ou fechar o quadro'),
            this.tapKey('F', 'sentar', 'f', 'KeyF', 'Sentar ou tocar música'),
            this.tapKey('E', 'usar', 'e', 'KeyE', 'Transmitir tela')
        );

        const jump = document.createElement('button');
        jump.id = 'tc-jump';
        jump.className = 'tc-btn';
        jump.type = 'button';
        jump.textContent = 'PULAR';
        jump.setAttribute('aria-label', 'Pular');
        jump.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            if (!window.__loftFrozen) this.player.jumpQueued = true;
        });

        actions.append(row, jump);

        const pause = document.createElement('button');
        pause.id = 'tc-pause';
        pause.className = 'tc-btn';
        pause.type = 'button';
        pause.textContent = '❚❚';
        pause.setAttribute('aria-label', 'Pausar');
        pause.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            this.onPause();
        });

        this.root.append(this.base, actions, pause);
        document.body.appendChild(this.root);
    }

    fire(type, key, code) {
        window.dispatchEvent(new KeyboardEvent(type, { key, code, bubbles: true, cancelable: true }));
    }

    makeBtn(label, sub, aria) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'tc-btn';
        b.setAttribute('aria-label', aria);
        b.innerHTML = `<span>${label}</span>` + (sub ? `<small>${sub}</small>` : '');
        return b;
    }

    // botão de toque simples: age como apertar a tecla uma vez
    tapKey(label, sub, key, code, aria) {
        const b = this.makeBtn(label, sub, aria);
        b.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            b.classList.add('down');
            this.fire('keydown', key, code);
            this.fire('keyup', key, code);
        });
        const up = () => b.classList.remove('down');
        b.addEventListener('pointerup', up);
        b.addEventListener('pointercancel', up);
        b.addEventListener('pointerleave', up);
        return b;
    }

    // botão de segurar: igual a manter a tecla pressionada (microfone)
    holdKey(label, sub, key, code, aria) {
        const b = this.makeBtn(label, sub, aria);
        let held = false;
        b.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            try { b.setPointerCapture(e.pointerId); } catch (err) { /* ok */ }
            held = true;
            b.classList.add('down');
            this.fire('keydown', key, code);
        });
        const up = () => {
            if (!held) return;
            held = false;
            b.classList.remove('down');
            this.fire('keyup', key, code);
        };
        b.addEventListener('pointerup', up);
        b.addEventListener('pointercancel', up);
        return b;
    }

    // ---------- analógico ----------
    bindStick() {
        const moveStick = (e) => {
            const rect = this.base.getBoundingClientRect();
            const cx = rect.left + rect.width / 2;
            const cy = rect.top + rect.height / 2;
            const R = rect.width * 0.34;
            let dx = e.clientX - cx;
            let dy = e.clientY - cy;
            const len = Math.hypot(dx, dy);
            if (len > R) { dx *= R / len; dy *= R / len; }
            this.knob.style.transform = `translate(${dx}px, ${dy}px)`;

            let nx = dx / R;
            let ny = dy / R;
            if (Math.hypot(nx, ny) < 0.12) { nx = 0; ny = 0; }   // zona morta
            this.stick.x = nx;
            this.stick.y = ny;   // para cima = negativo = frente
        };

        this.base.addEventListener('pointerdown', (e) => {
            if (this.stickId !== null) return;
            e.preventDefault();
            this.stickId = e.pointerId;
            try { this.base.setPointerCapture(e.pointerId); } catch (err) { /* ok */ }
            moveStick(e);
        });
        this.base.addEventListener('pointermove', (e) => {
            if (e.pointerId !== this.stickId) return;
            e.preventDefault();
            moveStick(e);
        });
        const end = (e) => {
            if (e.pointerId !== this.stickId) return;
            this.resetStick();
        };
        this.base.addEventListener('pointerup', end);
        this.base.addEventListener('pointercancel', end);
    }

    resetStick() {
        this.stickId = null;
        this.stick.x = 0;
        this.stick.y = 0;
        this.knob.style.transform = 'translate(0px, 0px)';
    }

    // ---------- olhar arrastando o dedo na tela ----------
    bindLook() {
        const dom = this.dom;

        dom.addEventListener('pointerdown', (e) => {
            if (e.pointerType === 'mouse' || this.lookId !== null) return;
            if (window.__loftFrozen) return;
            this.lookId = e.pointerId;
            this.lastX = e.clientX;
            this.lastY = e.clientY;
            try { dom.setPointerCapture(e.pointerId); } catch (err) { /* ok */ }
        });

        dom.addEventListener('pointermove', (e) => {
            if (e.pointerId !== this.lookId) return;
            if (window.__loftFrozen) return;
            const dx = e.clientX - this.lastX;
            const dy = e.clientY - this.lastY;
            this.lastX = e.clientX;
            this.lastY = e.clientY;
            this.cam.yaw -= dx * this.lookSensitivity;
            this.cam.pitch -= dy * this.lookSensitivity;
            this.cam.pitch = Math.max(-1.45, Math.min(1.45, this.cam.pitch));
        });

        const end = (e) => {
            if (e.pointerId === this.lookId) this.lookId = null;
        };
        dom.addEventListener('pointerup', end);
        dom.addEventListener('pointercancel', end);
    }
}
