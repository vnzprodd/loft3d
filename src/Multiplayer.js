import * as THREE from 'three';
import { Peer } from 'peerjs';

const AVATAR_COLORS = [
    0xd71920, // vermelho accent
    0x1c71d8, // azul
    0x2ec27e, // verde
    0xe5a50a, // amarelo
    0x9141ac, // roxo
    0xff7800  // laranja
];

function colorFromName(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function makeNameSprite(name, bubbleText = '') {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 192;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Balão de fala temporário quando a pessoa manda mensagem no chat
    if (bubbleText) {
        const trimmed = bubbleText.length > 34 ? bubbleText.slice(0, 33) + '…' : bubbleText;
        ctx.font = '600 24px "Segoe UI", sans-serif';
        const bw = Math.min(480, ctx.measureText(trimmed).width + 36);
        const bx = (canvas.width - bw) / 2;

        ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
        ctx.beginPath();
        ctx.roundRect(bx, 14, bw, 48, 14);
        ctx.fill();

        ctx.fillStyle = '#111318';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(trimmed, canvas.width / 2, 38);
    }

    // Placa com o nome do jogador
    ctx.font = '700 30px "Segoe UI", sans-serif';
    const textW = ctx.measureText(name).width;
    const pillW = Math.min(460, textW + 44);
    const pillX = (canvas.width - pillW) / 2;

    ctx.fillStyle = 'rgba(12, 13, 16, 0.82)';
    ctx.beginPath();
    ctx.roundRect(pillX, 82, pillW, 54, 16);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#f2f3f5';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, canvas.width / 2, 109);

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(2.2, 0.82, 1);
    sprite.position.set(0, 2.15, 0);
    return sprite;
}

function createGeometricAvatar(name, colorHex) {
    const root = new THREE.Group();

    const bodyMat = new THREE.MeshStandardMaterial({
        color: colorHex,
        roughness: 0.42,
        metalness: 0.25
    });
    const darkMat = new THREE.MeshStandardMaterial({
        color: 0x16181d,
        roughness: 0.5,
        metalness: 0.6
    });
    const visorMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0xaad8ff,
        emissiveIntensity: 0.9,
        roughness: 0.2
    });

    // Tronco geométrico (cápsula)
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.58, 8, 16), bodyMat);
    torso.position.y = 0.86;
    torso.castShadow = true;
    root.add(torso);

    // Cabeça geométrica
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.34, 0.36), darkMat);
    head.position.y = 1.56;
    head.castShadow = true;
    root.add(head);

    // Visor frontal (-Z é a direção para onde o jogador olha)
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.09, 0.04), visorMat);
    visor.position.set(0, 1.57, -0.18);
    root.add(visor);

    // Mãos geométricas laterais
    const handGeo = new THREE.SphereGeometry(0.085, 12, 12);
    const leftHand = new THREE.Mesh(handGeo, bodyMat);
    leftHand.position.set(-0.38, 0.88, -0.08);
    const rightHand = new THREE.Mesh(handGeo, bodyMat);
    rightHand.position.set(0.38, 0.88, -0.08);
    root.add(leftHand, rightHand);

    // Nome flutuante
    const label = makeNameSprite(name);
    root.add(label);

    return { root, head, leftHand, rightHand, label, name, bubbleTimer: 0 };
}

export class MultiplayerManager {
    constructor({ scene, playerName, chat, onCountChange, initialState }) {
        this.scene = scene;
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
        this.hostConn = null;          // usado se for convidado
        this.guestConns = new Map();   // peerId -> DataConnection (usado se for host)
        this.roster = new Map();       // peerId -> { id, name, color, state }
        this.avatars = new Map();      // peerId -> { root, targetPos, targetYaw, ... }

        this.sendTimer = 0;
        this.destroyed = false;
        this.retryTimer = null;

        if (this.chat) {
            this.chat.bindMultiplayer(this);
        }

        this.connect();
    }

    // Sala única: todo mundo que abrir o link cai no "loft-principal"
    static getRoomId() {
        return 'loft-principal';
    }

    connect() {
        if (this.destroyed) return;
        this.cleanupPeer();

        // Tenta entrar como Host da sala primeiro
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
            // Se o ID do host já existe, o amigo já criou a sala -> entra como convidado
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
                // Se o host sair, limpa avatares antigos e tenta assumir a sala
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

                // Envia para o recém-chegado todos que já estão na sala
                conn.send({
                    type: 'welcome',
                    players: Array.from(this.roster.values())
                });

                // Avisa os demais convidados
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
                try { conn.send(payload); } catch (e) { /* ignora falha pontual */ }
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
            const meshData = createGeometricAvatar(playerInfo.name, playerInfo.color);
            const s = playerInfo.state || { x: 0, y: 0, z: 6, yaw: 0, isSitting: false };
            meshData.root.position.set(s.x, s.y, s.z);
            meshData.root.rotation.y = s.yaw || 0;
            this.scene.add(meshData.root);

            av = {
                ...meshData,
                targetPos: new THREE.Vector3(s.x, s.y, s.z),
                targetYaw: s.yaw || 0,
                isSitting: !!s.isSitting,
                walkPhase: 0
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

        av.label = makeNameSprite(av.name, text);
        av.root.add(av.label);
        av.bubbleTimer = 5.0; // balão fica visível por 5 segundos
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
        // 1. Envia nossa posição 20x por segundo
        this.sendTimer += dt;
        if (this.sendTimer >= 0.05 && this.myId && localState) {
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

        // 2. Suaviza movimento dos avatares remotos
        const lerpAlpha = Math.min(1, dt * 14);
        for (const av of this.avatars.values()) {
            const dist = av.root.position.distanceTo(av.targetPos);
            av.root.position.lerp(av.targetPos, lerpAlpha);

            // Interpolação angular pelo menor arco
            let diff = av.targetYaw - av.root.rotation.y;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;
            av.root.rotation.y += diff * lerpAlpha;

            // Animação leve das mãos ao andar
            if (dist > 0.015 && !av.isSitting) {
                av.walkPhase += dt * 11;
                av.leftHand.position.z = -0.08 + Math.sin(av.walkPhase) * 0.12;
                av.rightHand.position.z = -0.08 - Math.sin(av.walkPhase) * 0.12;
            } else {
                av.leftHand.position.z = -0.08;
                av.rightHand.position.z = -0.08;
            }

            // Limpa balão de fala após 5s
            if (av.bubbleTimer > 0) {
                av.bubbleTimer -= dt;
                if (av.bubbleTimer <= 0) {
                    av.root.remove(av.label);
                    if (av.label.material.map) av.label.material.map.dispose();
                    av.label.material.dispose();
                    av.label = makeNameSprite(av.name);
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