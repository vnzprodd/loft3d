// Voz com push-to-talk: segure V para abrir o microfone.
// A sinalizacao WebRTC viaja pelo BroadcastChannel, entao abas/janelas do mesmo
// navegador se ouvem de verdade (sem servidor). Para falar pela internet, troque
// o canal por um WebSocket — o resto do codigo continua igual.
const CHANNEL = 'loft-industrial-voice';

export class VoiceChat {
    constructor(name) {
        this.name = name || 'Convidado';
        this.id = Math.random().toString(36).slice(2, 9);
        this.micTrack = null;
        this.micStream = null;
        this.talking = false;
        this.requesting = false;
        this.analyser = null;
        this.levelData = null;
        this.rafId = null;

        this.peers = new Map();        // id -> { pc, name, pending: [] }
        this.transceivers = new Map(); // id -> RTCRtpTransceiver
        this.remoteAudio = new Map();  // id -> HTMLAudioElement
        this.remoteTalking = new Map();// id -> name

        this.buildUI();
        this.bindKeys();

        this.bus = null;
        try {
            this.bus = new BroadcastChannel(CHANNEL);
            this.bus.onmessage = (e) => this.onSignal(e.data);
        } catch (err) {
            console.warn('Voz entre abas indisponível neste navegador:', err);
        }

        this.announce();
        this.setState('idle', 'Segure V para falar');
    }

    // ---------- interface ----------
    buildUI() {
        this.pill = document.createElement('div');
        this.pill.id = 'voice-pill';
        this.pill.innerHTML = `
            <span class="v-dot"></span>
            <span class="v-label">Segure V para falar</span>
            <span class="v-bars"><i></i><i></i><i></i></span>
        `;
        document.body.appendChild(this.pill);

        this.dot = this.pill.querySelector('.v-dot');
        this.label = this.pill.querySelector('.v-label');
        this.bars = Array.from(this.pill.querySelectorAll('.v-bars i'));

        this.roster = document.createElement('div');
        this.roster.id = 'voice-roster';
        document.body.appendChild(this.roster);
    }

    setState(kind, text) {
        this.pill.dataset.state = kind;
        this.label.textContent = text;
        this.pill.classList.toggle('live', kind === 'talking');
    }

    updateRoster() {
        const names = Array.from(this.remoteTalking.values());
        if (!names.length) {
            this.roster.hidden = true;
            this.roster.textContent = '';
            return;
        }
        this.roster.hidden = false;
        this.roster.textContent = '🔊 ' + names.join(', ') + (names.length > 1 ? ' estão falando' : ' está falando');
    }

    // ---------- microfone ----------
    bindKeys() {
        window.addEventListener('keydown', (e) => {
            if (e.repeat) return;
            if (e.key.toLowerCase() !== 'v') return;
            const el = document.activeElement;
            if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
            e.preventDefault();
            this.startTalking();
        });

        window.addEventListener('keyup', (e) => {
            if (e.key.toLowerCase() !== 'v') return;
            this.stopTalking();
        });

        // solta o microfone se a janela perder o foco com V pressionado
        window.addEventListener('blur', () => this.stopTalking());
    }

    async ensureMic() {
        if (this.micTrack) return true;
        if (this.requesting) return false;

        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            this.setState('error', 'Microfone indisponível: abra a página em https ou localhost');
            return false;
        }

        this.requesting = true;
        this.setState('pending', 'Ativando microfone…');
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
                video: false
            });
            this.micStream = stream;
            this.micTrack = stream.getAudioTracks()[0];
            this.micTrack.enabled = false;

            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            this.audioCtx = ctx;
            const src = ctx.createMediaStreamSource(stream);
            this.analyser = ctx.createAnalyser();
            this.analyser.fftSize = 512;
            this.analyser.smoothingTimeConstant = 0.7;
            this.levelData = new Uint8Array(this.analyser.frequencyBinCount);
            src.connect(this.analyser);

            // liga o microfone nas conexões que já existem
            this.transceivers.forEach(t => {
                try { t.sender.replaceTrack(this.micTrack); } catch (err) { /* conexão morta */ }
            });

            this.requesting = false;
            this.announce();
            return true;
        } catch (err) {
            this.requesting = false;
            const denied = err && (err.name === 'NotAllowedError' || err.name === 'SecurityError');
            this.setState('error', denied ? 'Permissão de microfone negada' : 'Não foi possível abrir o microfone');
            console.error('Falha ao abrir o microfone:', err);
            return false;
        }
    }

    async startTalking() {
        if (this.talking) return;
        const ok = await this.ensureMic();
        if (!ok) return;

        this.talking = true;
        this.micTrack.enabled = true;
        if (this.audioCtx && this.audioCtx.state === 'suspended') this.audioCtx.resume();
        this.setState('talking', 'Você está falando — solte V para parar');
        this.broadcastState(true);
        this.runMeter();
    }

    stopTalking() {
        if (!this.talking) return;
        this.talking = false;
        if (this.micTrack) this.micTrack.enabled = false;
        this.setState('idle', 'Segure V para falar');
        this.broadcastState(false);
        this.stopMeter();
    }

    runMeter() {
        const tick = () => {
            if (!this.talking || !this.analyser) return;
            this.analyser.getByteFrequencyData(this.levelData);
            let sum = 0;
            for (let i = 0; i < this.levelData.length; i++) sum += this.levelData[i];
            const level = Math.min(1, (sum / this.levelData.length) / 70);
            this.bars.forEach((bar, i) => {
                const on = level > (i + 1) * 0.16;
                bar.style.opacity = on ? '1' : '0.2';
            });
            this.rafId = requestAnimationFrame(tick);
        };
        this.rafId = requestAnimationFrame(tick);
    }

    stopMeter() {
        if (this.rafId) cancelAnimationFrame(this.rafId);
        this.rafId = null;
        this.bars.forEach(bar => { bar.style.opacity = '0.2'; });
    }

    // ---------- sinalização ----------
    post(payload) {
        if (!this.bus) return;
        try { this.bus.postMessage(payload); } catch (err) { /* canal fechado */ }
    }

    announce() {
        this.post({ type: 'hello', from: this.id, name: this.name, mic: !!this.micTrack });
    }

    broadcastState(talking) {
        this.post({ type: 'ptt', from: this.id, name: this.name, talking });
    }

    onSignal(m) {
        if (!m || m.from === this.id) return;

        switch (m.type) {
            case 'hello':
                this.peerName(m.from, m.name);
                // o id menor liga — evita as duas abas se chamarem ao mesmo tempo
                if (this.id < m.from) this.call(m.from);
                break;
            case 'offer':
                this.answer(m.from, m.name, m.sdp);
                break;
            case 'answer': {
                const entry = this.peers.get(m.from);
                if (!entry) return;
                entry.pc.setRemoteDescription({ type: 'answer', sdp: m.sdp })
                    .then(() => this.flushIce(entry))
                    .catch(err => console.warn('Falha na resposta de voz:', err));
                break;
            }
            case 'ice': {
                const entry = this.peers.get(m.from);
                if (!entry) return;
                if (entry.pc.remoteDescription && entry.pc.remoteDescription.type) {
                    entry.pc.addIceCandidate(m.candidate).catch(() => {});
                } else {
                    entry.pending.push(m.candidate);
                }
                break;
            }
            case 'ptt':
                this.peerName(m.from, m.name);
                if (m.talking) this.remoteTalking.set(m.from, m.name);
                else this.remoteTalking.delete(m.from);
                this.updateRoster();
                break;
            case 'bye':
                this.dropPeer(m.from);
                break;
        }
    }

    peerName(id, name) {
        if (!name) return;
        const entry = this.peers.get(id);
        if (entry) entry.name = name;
    }

    flushIce(entry) {
        entry.pending.forEach(c => entry.pc.addIceCandidate(c).catch(() => {}));
        entry.pending = [];
    }

    createPeer(id, name) {
        const pc = new RTCPeerConnection({ iceServers: [] });

        const entry = { pc, name: name || 'Convidado', pending: [] };
        this.peers.set(id, entry);

        pc.onicecandidate = (e) => {
            if (e.candidate) this.post({ type: 'ice', from: this.id, to: id, candidate: e.candidate.toJSON ? e.candidate.toJSON() : e.candidate });
        };

        pc.ontrack = (e) => {
            let audio = this.remoteAudio.get(id);
            if (!audio) {
                audio = document.createElement('audio');
                audio.autoplay = true;
                audio.playsInline = true;
                document.body.appendChild(audio);
                this.remoteAudio.set(id, audio);
            }
            audio.srcObject = e.streams[0];
            audio.play().catch(() => { /* o navegador pede um clique antes */ });
        };

        pc.onconnectionstatechange = () => {
            if (['failed', 'closed', 'disconnected'].includes(pc.connectionState)) {
                if (pc.connectionState !== 'disconnected') this.dropPeer(id);
            }
        };

        return { pc, entry };
    }

    attachSender(entry) {
        let t = entry.pc.getTransceivers()[0];
        if (!t) {
            t = entry.pc.addTransceiver('audio', { direction: 'sendrecv' });
        } else {
            t.direction = 'sendrecv';
        }
        if (this.micTrack) {
            try { t.sender.replaceTrack(this.micTrack); } catch (err) { /* sem faixa */ }
        }
        this.transceivers.set(this.peerIdOf(entry), t);
        return t;
    }

    peerIdOf(entry) {
        for (const [id, e] of this.peers) if (e === entry) return id;
        return null;
    }

    async call(id) {
        if (this.peers.has(id)) return;
        const { pc, entry } = this.createPeer(id);
        this.attachSender(entry);
        try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            this.post({ type: 'offer', from: this.id, to: id, name: this.name, sdp: pc.localDescription.sdp });
        } catch (err) {
            console.warn('Falha ao iniciar a voz:', err);
        }
    }

    async answer(id, name, sdp) {
        if (this.peers.has(id)) this.dropPeer(id);
        const { pc, entry } = this.createPeer(id, name);
        try {
            await pc.setRemoteDescription({ type: 'offer', sdp });
            this.attachSender(entry);
            this.flushIce(entry);
            const ans = await pc.createAnswer();
            await pc.setLocalDescription(ans);
            this.post({ type: 'answer', from: this.id, to: id, sdp: pc.localDescription.sdp });
        } catch (err) {
            console.warn('Falha ao responder a chamada de voz:', err);
        }
    }

    dropPeer(id) {
        const entry = this.peers.get(id);
        if (entry) {
            try { entry.pc.close(); } catch (err) { /* já fechada */ }
            this.peers.delete(id);
        }
        this.transceivers.delete(id);
        const audio = this.remoteAudio.get(id);
        if (audio) {
            audio.srcObject = null;
            audio.remove();
            this.remoteAudio.delete(id);
        }
        if (this.remoteTalking.delete(id)) this.updateRoster();
    }

    dispose() {
        this.stopTalking();
        this.peers.forEach((_, id) => this.dropPeer(id));
        if (this.micStream) this.micStream.getTracks().forEach(t => t.stop());
        this.post({ type: 'bye', from: this.id });
        if (this.bus) this.bus.close();
    }
}
