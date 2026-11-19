const STYLE = `
#tc-root { position: fixed; inset: 0; z-index: 30; pointer-events: none; display: none; }
#tc-root > * { pointer-events: auto; touch-action: none; }

#tc-stick {
    position: absolute;
    left: calc(22px + env(safe-area-inset-left, 0px));
    bottom: calc(22px + env(safe-area-inset-bottom, 0px));
    width: 140px; height: 140px; border-radius: 50%;
    background: rgba(16, 17, 20, 0.45);
    border: 2px solid rgba(255, 255, 255, 0.28);
}
#tc-knob {
    position: absolute; left: 50%; top: 50%;
    width: 60px; height: 60px; margin: -30px 0 0 -30px; border-radius: 50%;
    background: rgba(255, 255, 255, 0.42);
    border: 2px solid rgba(255, 255, 255, 0.6);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.45);
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
    background: rgba(16, 17, 20, 0.85);
    border: 1px solid rgba(255, 255, 255, 0.3);
    color: #f2f3f5; font: 700 15px/1 'Segoe UI', sans-serif;
    padding: 0; cursor: pointer; touch-action: none;
    -webkit-tap-highlight-color: transparent;
}
.tc-btn small { font-size: 8px; font-weight: 600; opacity: 0.7; margin-top: 2px; letter-spacing: 0.4px; text-transform: uppercase; }
.tc-btn:active, .tc-btn.down { background: rgba(215, 25, 32, 0.85); border-color: #d71920; }
#tc-jump { width: 76px; height: 76px; font-size: 13px; letter-spacing: 0.8px; }

#tc-pause {
    position: absolute;
    top: calc(12px + env(safe-area-inset-top, 0px));
    right: calc(12px + env(safe-area-inset-right, 0px));
    width: 42px; height: 42px; font-size: 13px;
}

/* Remove blur em tempo real no celular para ganhar FPS */
body.touch-mode { overscroll-behavior: none; -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }
body.touch-mode input, body.touch-mode textarea { -webkit-user-select: text; user-select: text; }
body.touch-mode canvas { touch-action: none; }
body.touch-mode .instructions { display: none; }
body.touch-mode #chat,
body.touch-mode #voice-pill,
body.touch-mode #voice-roster,
body.touch-mode #pause-menu {
    backdrop-filter: none !important;
    -webkit-backdrop-filter: none !important;
    background: rgba(16, 17, 20, 0.92);
}
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