const CHANNEL = 'loft-industrial-chat';
const MAX_MESSAGES = 200;

const NAMES = [
    'Ana', 'Bruno', 'Carla', 'Diego', 'Elisa', 'Felipe', 'Gabi', 'Heitor',
    'Iara', 'João', 'Lia', 'Marcos', 'Nina', 'Otávio', 'Paula', 'Rafa',
    'Sofia', 'Tiago', 'Vera', 'Yuri'
];

export class Chat {
    constructor(name) {
        this.name = name || Chat.pickName();
        this.panel = document.getElementById('chat');
        this.list = document.getElementById('chat-messages');
        this.form = document.getElementById('chat-form');
        this.input = document.getElementById('chat-input');
        this.toggleBtn = document.getElementById('chat-toggle');
        this.badge = document.getElementById('chat-badge');

        this.channel = null;
        this.multiplayer = null;
        this.unread = 0;
        this.collapsed = false;

        // Limpa mensagens antigas se o usuário saiu e entrou novamente
        this.list.innerHTML = '';

        try {
            this.channel = new BroadcastChannel(CHANNEL);
            this.channel.onmessage = (e) => this.receiveLocal(e.data);
        } catch (err) {
            console.warn('Conversa entre abas indisponível neste navegador:', err);
        }

        this.onSubmit = (e) => {
            e.preventDefault();
            this.send(this.input.value);
            this.input.value = '';
        };
        this.form.onsubmit = this.onSubmit;

        this.toggleBtn.onclick = () => this.setCollapsed(!this.collapsed);

        this.onKeyDown = (e) => {
            if (e.repeat || window.__loftFrozen) return;
            const el = document.activeElement;
            const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);

            if (e.key === 'Escape' && el === this.input) {
                this.input.blur();
                return;
            }
            if (typing) return;
            if (e.key.toLowerCase() === 't') {
                e.preventDefault();
                this.focus();
            }
        };
        window.addEventListener('keydown', this.onKeyDown);

        this.system(`Você entrou como ${this.name}.`);
    }

    bindMultiplayer(multiplayer) {
        this.multiplayer = multiplayer;
    }

    static pickName() {
        try {
            const saved = sessionStorage.getItem('loft-nome');
            if (saved) return saved;
            const n = NAMES[Math.floor(Math.random() * NAMES.length)] + ' ' + (10 + Math.floor(Math.random() * 89));
            sessionStorage.setItem('loft-nome', n);
            return n;
        } catch (err) {
            return NAMES[Math.floor(Math.random() * NAMES.length)];
        }
    }

    postLocal(payload) {
        if (!this.channel) return;
        try { this.channel.postMessage(payload); } catch (err) { /* canal fechado */ }
    }

    send(text) {
        const body = (text || '').trim();
        if (!body) return;
        const now = Date.now();
        this.render({ name: this.name, text: body, time: now, mine: true });

        if (this.multiplayer) {
            this.multiplayer.sendChat(body);
        } else {
            this.postLocal({ type: 'msg', name: this.name, text: body, time: now });
        }
    }

    receiveLocal(data) {
        if (!data || this.multiplayer) return;
        if (data.type === 'msg') {
            this.receiveRemote(data);
        } else if (data.type === 'join') {
            this.system(`${data.name} entrou na sala.`);
        }
    }

    receiveRemote(data) {
        if (!data || !data.text) return;
        this.render({ name: data.name, text: data.text, time: data.time || Date.now(), mine: false });
        if (this.collapsed || document.activeElement !== this.input) this.bumpUnread();
    }

    render({ name, text, time, mine }) {
        const row = document.createElement('div');
        row.className = 'msg' + (mine ? ' mine' : '');

        const head = document.createElement('div');
        head.className = 'msg-head';

        const who = document.createElement('span');
        who.className = 'msg-who';
        who.textContent = mine ? 'Você' : name;

        const when = document.createElement('span');
        when.className = 'msg-time';
        when.textContent = new Date(time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

        head.append(who, when);

        const body = document.createElement('div');
        body.className = 'msg-body';
        body.textContent = text;

        row.append(head, body);
        this.list.appendChild(row);

        while (this.list.children.length > MAX_MESSAGES) {
            this.list.removeChild(this.list.firstChild);
        }
        this.list.scrollTop = this.list.scrollHeight;
    }

    system(text) {
        const row = document.createElement('div');
        row.className = 'msg system';
        row.textContent = text;
        this.list.appendChild(row);
        this.list.scrollTop = this.list.scrollHeight;
    }

    bumpUnread() {
        this.unread++;
        if (this.badge) {
            this.badge.textContent = String(this.unread);
            this.badge.hidden = false;
        }
    }

    setCollapsed(value) {
        this.collapsed = value;
        this.panel.classList.toggle('collapsed', value);
        this.toggleBtn.textContent = value ? '+' : '–';
        this.toggleBtn.setAttribute('aria-label', value ? 'Abrir o chat' : 'Recolher o chat');
        if (!value) {
            this.unread = 0;
            if (this.badge) this.badge.hidden = true;
        }
    }

    focus() {
        this.setCollapsed(false);
        this.input.focus();
        if (document.pointerLockElement) document.exitPointerLock();
    }

    destroy() {
        window.removeEventListener('keydown', this.onKeyDown);
        if (this.channel) {
            try { this.channel.close(); } catch (e) { /* ignora */ }
        }
    }
}