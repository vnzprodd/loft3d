import * as THREE from 'three';
import { Peer } from 'peerjs';

const AVATAR_COLORS = [
    0xd71920,
    0x1c71d8,
    0x2ec27e,
    0xe5a50a,
    0x9141ac,
    0xff7800
];

const isMobileDevice = () =>
    typeof window !== 'undefined' &&
    (window.matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent));

function colorFromName(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function makeNameSprite(name, bubbleText = '', isMobile = false) {
    const scale = isMobile ? 256 / 384 : 1;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(384 * scale);
    canvas.height = Math.round(144 * scale);
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);

    ctx.clearRect(0, 0, 384, 144);

    if (bubbleText) {
        const trimmed = bubbleText.length > 34 ? bubbleText.slice(0, 33) + '…' : bubbleText;
        ctx.font = '600 18px "Segoe UI", sans-serif';
        const bw = Math.min(360, ctx.measureText(trimmed).width + 28);
        const bx = (384 - bw) / 2;

        ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
        ctx.beginPath();
        ctx.roundRect(bx, 10, bw, 36, 10);
        ctx.fill();

        ctx.fillStyle = '#111318';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(trimmed, 192, 28);
    }

    ctx.font = '700 23px "Segoe UI", sans-serif';
    const textW = ctx.measureText(name).width;
    const pillW = Math.min(345, textW + 34);
    const pillX = (384 - pillW) / 2;

    ctx.fillStyle = 'rgba(12, 13, 16, 0.85)';
    ctx.beginPath();
    ctx.roundRect(pillX, 62, pillW, 40, 12);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = '#f2f3f5';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, 192, 82);

    const tex = new THREE.CanvasTexture(canvas);
    if (isMobile) {
        tex.generateMipmaps = false;
        tex.minFilter = THREE.LinearFilter;
    }
    tex.needsUpdate = true;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(2.2, 0.82, 1);
    sprite.position.set(0, 2.15, 0);
    return sprite;
}

function createGeometricAvatar(name, colorHex, isMobile = false) {
    const root = new THREE.Group();

    const bodyMat = isMobile
        ? new THREE.MeshLambertMaterial({ color: colorHex })
        : new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.42, metalness: 0.25 });
    const darkMat = isMobile
        ? new THREE.MeshLambertMaterial({ color: 0x16181d })
        : new THREE.MeshStandardMaterial({ color: 0x16181d, roughness: 0.5, metalness: 0.6 });
    const visorMat = new THREE.MeshBasicMaterial({ color: 0xaad8ff });

    const torso = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.26, 0.58, isMobile ? 2 : 4, isMobile ? 6 : 10),
        bodyMat
    );
    torso.position.y = 0.86;
    torso.castShadow = !isMobile;
    root.add(torso);

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.34, 0.36), darkMat);
    head.position.y = 1.56;
    head.castShadow = !isMobile;
    root.add(head);

    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.09, 0.04), visorMat);
    visor.position.set(0, 1.57, -0.18);
    root.add(visor);

    const handGeo = new THREE.SphereGeometry(0.085, isMobile ? 5 : 8, isMobile ? 5 : 8);
    const leftHand = new THREE.Mesh(handGeo, bodyMat);
    leftHand.position.set(-0.38, 0.88, -0.08);
    const rightHand = new THREE.Mesh(handGeo, bodyMat);
    rightHand.position.set(0.38, 0.88, -0.08);
    root.add(leftHand, rightHand);

    const label = makeNameSprite(name, '', isMobile);
    root.add(label);

    return { root, head, leftHand, rightHand, label, name, bubbleTimer: 0 };
}

export class MultiplayerManager {
    constructor({ scene, playerName, chat, onCountChange, initialState }) {
        this.scene = scene;
        this.isMobile = isMobileDevice();
        this.playerName = playerName;
        this.playerColor = colorFromName(playerName);
        this.chat = chat;
        this.onCountChange = onCountChange || (() => {});

        this.initialState = initialState || { x: 0, y: 0, z: 6, yaw: 0, isSitting: false };
        this.roomId = MultiplayerManager.getRoomId();
        this.hostPeerId = `vnz-loft3d-host-${this.roomId}`;

        this.peer = null;
        this.isHost = false;
        this.myId = '';
        this.hostConn = null;
        this.guestConns = new Map();
        this.roster = new Map();
        this.avatars = new Map();

        this.sendTimer = 0;
        this.sendInterval = this.isMobile ? 1 / 15 : 1 / 30;
        this.destroyed = false;
        this.retryTimer = null;

        if (this.chat) {
            this.chat.bindMultiplayer(this);
        }

        this.connect();
    }

    static getRoomId() {
        return 'loft-principal';
    }

    connect() {
        if (this.destroyed) return;
        this.cleanupPeer();

        const peer = new Peer(this.hostPeerId);
        this.peer = peer;

        peer.on('open', (id) => {
            if (this.destroyed) return;
            this.isHost = true;
            this.myId = id;
            this.roster.set(this.myId, {
                id: this.myId,
                name: this.playerName,
                color: this.playerColor,
                state: { ...this.initialState }
            });
            this.updateOnlineCount();
        });

        peer.on('connection', (conn) => {
            if (!this.isHost || this.destroyed) return;
            this.setupHostGuestConnection(conn);
        });

        peer.on('error', (err) => {
            if (this.destroyed) return;
            if (err.type === 'unavailable-id') {
                this.connectAsGuest();
            } else if (err.type === 'peer-unavailable') {
                this.retryTimer = window.setTimeout(() => this.connect(), 1500);
            } else {
                console.warn('Multiplayer aviso:', err.type);
            }
        });
    }

    connectAsGuest() {
        if (this.destroyed) return;
        this.cleanupPeer();

        const peer = new Peer();
        this.peer = peer;
        this.isHost = false;

        peer.on('open', (id) => {
            if (this.destroyed) return;
            this.myId = id;
            const conn = peer.connect(this.hostPeerId, { reliable: true });
            this.hostConn = conn;

            conn.on('open', () => {
                conn.send({
                    type: 'hello',
                    id: this.myId,
                    name: this.playerName,
                    color: this.playerColor,
                    state: { ...this.initialState }
                });
            });

            conn.on('data', (msg) => this.handleGuestMessage(msg));

            conn.on('close', () => {
                if (this.destroyed) return;
                this.clearAllAvatars();
                this.roster.clear();
                this.updateOnlineCount();
                this.retryTimer = window.setTimeout(() => this.connect(), 500 + Math.random() * 800);
            });

            conn.on('error', () => {
                if (this.destroyed) return;
                this.retryTimer = window.setTimeout(() => this.connect(), 1500);
            });
        });

        peer.on('error', () => {
            if (this.destroyed) return;
            this.retryTimer = window.setTimeout(() => this.connect(), 1500);
        });
    }

    setupHostGuestConnection(conn) {
        conn.on('data', (msg) => {
            if (!msg || typeof msg !== 'object') return;

            if (msg.type === 'hello') {
                this.guestConns.set(msg.id, conn);
                const info = {
                    id: msg.id,
                    name: msg.name || 'Visitante',
                    color: msg.color || colorFromName(msg.id),
                    state: msg.state || { x: 0, y: 0, z: 6, yaw: 0, isSitting: false }
                };
                this.roster.set(msg.id, info);
                this.spawnOrUpdateAvatar(info);
                this.updateOnlineCount();

                if (this.chat) {
                    this.chat.system(`${info.name} entrou na sala.`);
                }

                conn.send({
                    type: 'welcome',
                    players: Array.from(this.roster.values())
                });

                this.broadcastFromHost({ type: 'join', player: info }, msg.id);
            } else if (msg.type === 'state') {
                const entry = this.roster.get(msg.id);
                if (entry) entry.state = msg.state;
                this.applyRemoteState(msg.id, msg.state);
                this.broadcastFromHost(msg, msg.id);
            } else if (msg.type === 'chat') {
                this.showSpeechBubble(msg.id, msg.text);
                if (this.chat) {
                    this.chat.receiveRemote({ name: msg.name, text: msg.text, time: msg.time });
                }
                this.broadcastFromHost(msg, msg.id);
            }
        });

        conn.on('close', () => {
            let leftId = null;
            for (const [pid, c] of this.guestConns.entries()) {
                if (c === conn) {
                    leftId = pid;
                    break;
                }
            }
            if (leftId) {
                const leftPlayer = this.roster.get(leftId);
                this.guestConns.delete(leftId);
                this.roster.delete(leftId);
                this.removeAvatar(leftId);
                this.updateOnlineCount();
                if (leftPlayer && this.chat) {
                    this.chat.system(`${leftPlayer.name} saiu da sala.`);
                }
                this.broadcastFromHost({ type: 'leave', id: leftId }, leftId);
            }
        });
    }

    handleGuestMessage(msg) {
        if (!msg || typeof msg !== 'object') return;

        if (msg.type === 'welcome' && Array.isArray(msg.players)) {
            msg.players.forEach((p) => {
                this.roster.set(p.id, p);
                if (p.id !== this.myId) {
                    this.spawnOrUpdateAvatar(p);
                }
            });
            this.updateOnlineCount();
        } else if (msg.type === 'join' && msg.player) {
            this.roster.set(msg.player.id, msg.player);
            if (msg.player.id !== this.myId) {
                this.spawnOrUpdateAvatar(msg.player);
                if (this.chat) {
                    this.chat.system(`${msg.player.name} entrou na sala.`);
                }
            }
            this.updateOnlineCount();
        } else if (msg.type === 'state') {
            if (msg.id !== this.myId) {
                this.applyRemoteState(msg.id, msg.state);
            }
        } else if (msg.type === 'chat') {
            if (msg.id !== this.myId) {
                this.showSpeechBubble(msg.id, msg.text);
                if (this.chat) {
                    this.chat.receiveRemote({ name: msg.name, text: msg.text, time: msg.time });
                }
            }
        } else if (msg.type === 'leave') {
            const leftPlayer = this.roster.get(msg.id);
            this.roster.delete(msg.id);
            this.removeAvatar(msg.id);
            this.updateOnlineCount();
            if (leftPlayer && this.chat) {
                this.chat.system(`${leftPlayer.name} saiu da sala.`);
            }
        }
    }

    broadcastFromHost(payload, excludeId = null) {
        for (const [pid, conn] of this.guestConns.entries()) {
            if (pid !== excludeId && conn.open) {
                try { conn.send(payload); } catch (e) { /* ignora */ }
            }
        }
    }

    sendChat(text) {
        if (!this.myId) return;
        const payload = {
            type: 'chat',
            id: this.myId,
            name: this.playerName,
            text,
            time: Date.now()
        };
        if (this.isHost) {
            this.broadcastFromHost(payload);
        } else if (this.hostConn && this.hostConn.open) {
            try { this.hostConn.send(payload); } catch (e) { /* ignora */ }
        }
    }

    spawnOrUpdateAvatar(playerInfo) {
        if (!playerInfo || playerInfo.id === this.myId) return;
        let av = this.avatars.get(playerInfo.id);
        if (!av) {
            const meshData = createGeometricAvatar(playerInfo.name, playerInfo.color, this.isMobile);
            const s = playerInfo.state || { x: 0, y: 0, z: 6, yaw: 0, isSitting: false };
            meshData.root.position.set(s.x, s.y, s.z);
            meshData.root.rotation.y = s.yaw || 0;
            this.scene.add(meshData.root);

            av = {
                ...meshData,
                targetPos: new THREE.Vector3(s.x, s.y, s.z),
                targetYaw: s.yaw || 0,
                isSitting: !!s.isSitting,
                walkPhase: 0,
                vel: new THREE.Vector3(),
                predicted: new THREE.Vector3(s.x, s.y, s.z),
                lastX: s.x, lastY: s.y, lastZ: s.z,
                lastStateTime: performance.now(),
                sinceState: 0
            };
            this.avatars.set(playerInfo.id, av);
        }
    }

    applyRemoteState(id, state) {
        if (!state) return;
        let av = this.avatars.get(id);
        if (!av) {
            const info = this.roster.get(id) || { id, name: 'Jogador', color: colorFromName(id), state };
            this.spawnOrUpdateAvatar(info);
            av = this.avatars.get(id);
        }
        if (!av) return;

        const now = performance.now();
        const gap = (now - av.lastStateTime) / 1000;
        if (gap > 0.005 && gap < 0.5) {
            const nvx = (state.x - av.lastX) / gap;
            const nvy = (state.y - av.lastY) / gap;
            const nvz = (state.z - av.lastZ) / gap;
            av.vel.x += (nvx - av.vel.x) * 0.6;
            av.vel.y += (nvy - av.vel.y) * 0.6;
            av.vel.z += (nvz - av.vel.z) * 0.6;
        } else {
            av.vel.set(0, 0, 0);
        }
        av.lastX = state.x; av.lastY = state.y; av.lastZ = state.z;
        av.lastStateTime = now;
        av.sinceState = 0;

        av.targetPos.set(state.x, state.y, state.z);
        av.targetYaw = state.yaw || 0;
        av.isSitting = !!state.isSitting;
    }

    showSpeechBubble(id, text) {
        const av = this.avatars.get(id);
        if (!av) return;
        av.root.remove(av.label);
        if (av.label.material.map) av.label.material.map.dispose();
        av.label.material.dispose();

        av.label = makeNameSprite(av.name, text, this.isMobile);
        av.root.add(av.label);
        av.bubbleTimer = 5.0;
    }

    removeAvatar(id) {
        const av = this.avatars.get(id);
        if (!av) return;
        this.scene.remove(av.root);
        this.avatars.delete(id);
    }

    clearAllAvatars() {
        for (const id of Array.from(this.avatars.keys())) {
            this.removeAvatar(id);
        }
    }

    updateOnlineCount() {
        const total = Math.max(1, this.roster.size);
        this.onCountChange(total);
    }

    update(dt, localState) {
        this.sendTimer += dt;
        if (this.sendTimer >= this.sendInterval && this.myId && localState) {
            this.sendTimer = 0;
            if (this.isHost) {
                const me = this.roster.get(this.myId);
                if (me) me.state = localState;
                this.broadcastFromHost({ type: 'state', id: this.myId, state: localState });
            } else if (this.hostConn && this.hostConn.open) {
                try {
                    this.hostConn.send({ type: 'state', id: this.myId, state: localState });
                } catch (e) { /* ignora */ }
            }
        }

        const lerpAlpha = 1 - Math.exp(-dt * 20);
        for (const av of this.avatars.values()) {
            av.sinceState += dt;
            const ahead = Math.min(av.sinceState, 0.1);
            av.predicted.copy(av.targetPos).addScaledVector(av.vel, ahead);

            if (av.root.position.distanceTo(av.predicted) > 5) {
                av.root.position.copy(av.predicted);
            }
            av.root.position.lerp(av.predicted, lerpAlpha);
            const moving = av.vel.lengthSq() > 0.09;

            let diff = av.targetYaw - av.root.rotation.y;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;
            av.root.rotation.y += diff * lerpAlpha;

            if (moving && !av.isSitting) {
                av.walkPhase += dt * 11;
                av.leftHand.position.z = -0.08 + Math.sin(av.walkPhase) * 0.12;
                av.rightHand.position.z = -0.08 - Math.sin(av.walkPhase) * 0.12;
            } else {
                av.leftHand.position.z = -0.08;
                av.rightHand.position.z = -0.08;
            }

            if (av.bubbleTimer > 0) {
                av.bubbleTimer -= dt;
                if (av.bubbleTimer <= 0) {
                    av.root.remove(av.label);
                    if (av.label.material.map) av.label.material.map.dispose();
                    av.label.material.dispose();
                    av.label = makeNameSprite(av.name, '', this.isMobile);
                    av.root.add(av.label);
                }
            }
        }
    }

    cleanupPeer() {
        window.clearTimeout(this.retryTimer);
        if (this.peer) {
            try { this.peer.destroy(); } catch (e) { /* ignora */ }
            this.peer = null;
        }
        this.hostConn = null;
        this.guestConns.clear();
    }

    disconnect() {
        this.destroyed = true;
        this.cleanupPeer();
        this.clearAllAvatars();
        this.roster.clear();
    }
}