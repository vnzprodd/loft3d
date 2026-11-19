import * as THREE from 'three';

const GALLERY_FLOOR_Y = 3.7;
const STAIR_START_Z = 2.8;
const STAIR_RUN = 6.0;
const STAIR_STEPS = 20;

const isMobileDevice = () =>
    typeof window !== 'undefined' &&
    (window.matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent));

const textureCache = new Map();

export function makeConcreteTexture(base = 0x8a8a88, size = null) {
    const texSize = size || (isMobileDevice() ? 256 : 512);
    const key = `concrete-${base}-${texSize}`;
    if (textureCache.has(key)) {
        const cloned = textureCache.get(key).clone();
        cloned.needsUpdate = true;
        return cloned;
    }

    const c = document.createElement('canvas');
    c.width = c.height = texSize;
    const ctx = c.getContext('2d');
    ctx.fillStyle = `#${new THREE.Color(base).getHexString()}`;
    ctx.fillRect(0, 0, texSize, texSize);

    const specks = texSize <= 256 ? 4500 : 18000;
    for (let i = 0; i < specks; i++) {
        const v = Math.random() * 60 - 30;
        ctx.fillStyle = `rgba(${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${Math.abs(v) / 350})`;
        ctx.fillRect(Math.random() * texSize, Math.random() * texSize, 2, 2);
    }
    for (let i = 0; i < 16; i++) {
        const r = (15 + Math.random() * 60) * (texSize / 512);
        const grd = ctx.createRadialGradient(
            Math.random() * texSize, Math.random() * texSize, 0,
            Math.random() * texSize, Math.random() * texSize, r
        );
        grd.addColorStop(0, `rgba(0,0,0,${Math.random() * 0.12})`);
        grd.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grd;
        ctx.fillRect(0, 0, texSize, texSize);
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        let x = Math.random() * texSize, y = Math.random() * texSize;
        ctx.moveTo(x, y);
        for (let j = 0; j < 6; j++) {
            x += (Math.random() * 60 - 30) * (texSize / 512);
            y += (Math.random() * 60 - 30) * (texSize / 512);
            ctx.lineTo(x, y);
        }
        ctx.lineWidth = Math.random() * 1.5;
        ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    textureCache.set(key, tex);

    const out = tex.clone();
    out.needsUpdate = true;
    return out;
}

export function makeWoodTexture(base = 0x8b5a2b, size = null) {
    const texSize = size || (isMobileDevice() ? 256 : 512);
    const key = `wood-${base}-${texSize}`;
    if (textureCache.has(key)) {
        const cloned = textureCache.get(key).clone();
        cloned.needsUpdate = true;
        return cloned;
    }

    const c = document.createElement('canvas');
    c.width = c.height = texSize;
    const ctx = c.getContext('2d');
    const scale = texSize / 512;
    const plankW = (20 + Math.random() * 30) * scale;
    const grainLines = texSize <= 256 ? 16 : 36;

    for (let x = 0; x < texSize; x += plankW) {
        const shade = 18 + Math.random() * 22;
        ctx.fillStyle = `rgb(${shade},${shade * 0.75},${shade * 0.55})`;
        ctx.fillRect(x, 0, plankW, texSize);
        for (let i = 0; i < grainLines; i++) {
            ctx.strokeStyle = `rgba(0,0,0,${Math.random() * 0.3})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            const gx = x + Math.random() * plankW;
            ctx.moveTo(gx, 0);
            ctx.bezierCurveTo(gx + 4 * scale, texSize * 0.33, gx - 4 * scale, texSize * 0.66, gx, texSize);
            ctx.stroke();
        }
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(x, 0, Math.max(1, 2 * scale), texSize);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    textureCache.set(key, tex);

    const out = tex.clone();
    out.needsUpdate = true;
    return out;
}

export class World {
    constructor(scene) {
        this.scene = scene;
        this.isMobile = isMobileDevice();
        this.colliders = [];
        this.mobileMatCache = new Map();

        this.matWood = this.mat({ map: makeWoodTexture(), roughness: 0.9 });
        this.matBlack = this.mat({ color: 0x141414, roughness: 0.6, metalness: 0.5 });
        this.matDarkGray = this.mat({ color: 0x2a2a2a, roughness: 0.8 });
        this.matMetal = this.mat({ color: 0x1c1c1c, roughness: 0.4, metalness: 0.8 });
        this.matConcreteWall = this.mat({ map: makeConcreteTexture(0x6f6f6d), roughness: 1 });

        this.init();
    }

    mat(opts) {
        if (this.isMobile) {
            const { roughness, metalness, ...rest } = opts;
            const key = `${rest.color ?? 'none'}_${rest.map ? rest.map.uuid : 'nomap'}_${rest.side ?? THREE.FrontSide}`;
            if (!rest.transparent && this.mobileMatCache.has(key)) {
                return this.mobileMatCache.get(key);
            }
            const m = new THREE.MeshLambertMaterial(rest);
            if (!rest.transparent) this.mobileMatCache.set(key, m);
            return m;
        }
        return new THREE.MeshStandardMaterial(opts);
    }

    box(w, h, d, mat, x, y, z, ry = 0, castShadow = true) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        m.position.set(x, y, z);
        m.rotation.y = ry;
        m.castShadow = castShadow && !this.isMobile;
        m.receiveShadow = !this.isMobile;
        this.scene.add(m);
        return m;
    }

    addCollider(cx, cz, w, d, minY = 0, maxY = 2.2) {
        this.colliders.push({
            minX: cx - w / 2, maxX: cx + w / 2,
            minZ: cz - d / 2, maxZ: cz + d / 2,
            minY, maxY
        });
    }

    isOnStairs(x, z) {
        return x > -1.05 && x < 1.05 &&
            z >= STAIR_START_Z - STAIR_RUN - 0.22 &&
            z <= STAIR_START_Z + 0.22;
    }

    groundHeightAt(x, z, currentY) {
        if (
            currentY > GALLERY_FLOOR_Y - 0.5 &&
            x > -7.8 && x < 7.8 &&
            z <= -3.2 && z > -25.0
        ) {
            return GALLERY_FLOOR_Y;
        }

        const stepDepth = STAIR_RUN / STAIR_STEPS;
        if (
            x > -1.1 && x < 1.1 &&
            z >= STAIR_START_Z - STAIR_RUN && z < STAIR_START_Z &&
            currentY < GALLERY_FLOOR_Y + 0.5
        ) {
            const index = THREE.MathUtils.clamp(
                Math.floor((STAIR_START_Z - z) / stepDepth),
                0,
                STAIR_STEPS - 1
            );
            return (index + 1) * (GALLERY_FLOOR_Y / STAIR_STEPS);
        }
        return 0;
    }

    init() {
        this.createFloor();
        this.createCeiling();
        this.createWalls();
        this.createMezzanine();
        this.createStairs();
        this.createKitchen();
        this.createLivingArea();
        this.createBalcony();
        this.createBeach();
        this.createPortfolioRoom();
        this.createLights();

        this.addCollider(8, -5.7, 0.3, 8.6, 0, 5.6);
        this.addCollider(8, 5.7, 0.3, 8.6, 0, 5.6);
    }

    createFloor() {
        const tex = makeWoodTexture();
        tex.repeat.set(8, 10);
        const floor = new THREE.Mesh(
            new THREE.PlaneGeometry(16, 20),
            this.mat({ map: tex, roughness: 0.85 })
        );
        floor.rotation.x = -Math.PI / 2;
        floor.position.set(0, 0, 0);
        floor.receiveShadow = !this.isMobile;
        this.scene.add(floor);
    }

    createCeiling() {
        const ceil = new THREE.Mesh(
            new THREE.PlaneGeometry(16, 20),
            this.mat({ color: 0x3a3a3a, roughness: 1 })
        );
        ceil.rotation.x = Math.PI / 2;
        ceil.position.set(0, 6, 0);
        this.scene.add(ceil);
    }

    createBalcony() {
        const tex = makeWoodTexture(0x9a6a3a);
        tex.repeat.set(3, 10);
        const deck = new THREE.Mesh(
            new THREE.PlaneGeometry(5, 20),
            this.mat({ map: tex, roughness: 0.85 })
        );
        deck.rotation.x = -Math.PI / 2;
        deck.position.set(10.5, 0.005, 0);
        deck.receiveShadow = !this.isMobile;
        this.scene.add(deck);

        const glassMat = this.isMobile
            ? new THREE.MeshBasicMaterial({
                color: 0xbcccd8, transparent: true, opacity: 0.2,
                side: THREE.DoubleSide, depthWrite: false
            })
            : new THREE.MeshStandardMaterial({
                color: 0xbcccd8, transparent: true, opacity: 0.28, roughness: 0.15
            });

        [[-6.5, 7], [6.5, 7]].forEach(([z, len]) => {
            const g = this.isMobile
                ? new THREE.Mesh(new THREE.PlaneGeometry(len, 1), glassMat)
                : new THREE.Mesh(new THREE.BoxGeometry(0.04, 1, len), glassMat);
            g.position.set(13, 0.5, z);
            if (this.isMobile) g.rotation.y = Math.PI / 2;
            this.scene.add(g);

            const top = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, len), this.matMetal);
            top.position.set(13, 1.02, z);
            this.scene.add(top);
        });
    }

    createBeach() {
        const sand = new THREE.Mesh(
            new THREE.PlaneGeometry(26, this.isMobile ? 64 : 90),
            this.mat({ color: 0xe2cf9f, roughness: 1 })
        );
        sand.rotation.x = -Math.PI / 2;
        sand.position.set(21, -0.01, 0);
        sand.receiveShadow = !this.isMobile;
        this.scene.add(sand);

        const seaSize = this.isMobile ? 140 : 400;
        const sea = new THREE.Mesh(
            new THREE.PlaneGeometry(seaSize, seaSize),
            this.isMobile
                ? new THREE.MeshLambertMaterial({ color: 0x2f7fb5, transparent: false })
                : new THREE.MeshStandardMaterial({ color: 0x2f7fb5, roughness: 0.25, metalness: 0.1, transparent: true, opacity: 0.9 })
        );
        sea.rotation.x = -Math.PI / 2;
        sea.position.set(34 + seaSize / 2, 0.0, 0);
        this.scene.add(sea);

        const trunkMat = this.mat({ color: 0x6b4a2b, roughness: 1 });
        const leafMat = this.mat({ color: 0x2f6b2f, roughness: 1 });
        [[17, -12], [19, 9], [23, -4], [26, 14], [16, 17]].forEach(([x, z]) => {
            const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 4, this.isMobile ? 5 : 6), trunkMat);
            trunk.position.set(x, 2, z);
            trunk.castShadow = !this.isMobile;
            this.scene.add(trunk);
            for (let i = 0; i < 6; i++) {
                const a = (i / 6) * Math.PI * 2;
                const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.18, 2, this.isMobile ? 4 : 5), leafMat);
                leaf.position.set(x + Math.cos(a) * 0.9, 4.1, z + Math.sin(a) * 0.9);
                leaf.rotation.set(Math.sin(a) * 1.2, 0, -Math.cos(a) * 1.2);
                this.scene.add(leaf);
            }
        });
    }

    createPortfolioRoom() {
        const w = 16, d = 15, h = 3.6;
        const cx = 0, cz = -17.5;
        const baseY = GALLERY_FLOOR_Y;
        const wallMat = this.mat({
            map: makeConcreteTexture(0x777777), roughness: 1
        });
        const floorMat = this.mat({
            map: makeConcreteTexture(0x888888), roughness: 0.9
        });

        const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), floorMat);
        floor.rotation.x = -Math.PI / 2;
        floor.position.set(cx, baseY, cz);
        this.scene.add(floor);

        const ceil = new THREE.Mesh(new THREE.PlaneGeometry(w, d), this.matWood);
        ceil.rotation.x = Math.PI / 2;
        ceil.position.set(cx, baseY + h, cz);
        this.scene.add(ceil);

        this.box(0.2, h, d, wallMat, -8, baseY + h / 2, cz, 0, false);
        this.box(0.2, h, d, wallMat, 8, baseY + h / 2, cz, 0, false);
        this.box(w, h, 0.2, wallMat, cx, baseY + h / 2, -25, 0, false);

        const doorL = -1.6, doorR = 1.6, doorH = 2.7;
        this.box(6.4, h, 0.2, wallMat, -4.8, baseY + h / 2, -10, 0, false);
        this.box(6.4, h, 0.2, wallMat, 4.8, baseY + h / 2, -10, 0, false);
        this.box(doorR - doorL, h - doorH, 0.2, wallMat,
            0, baseY + doorH + (h - doorH) / 2, -10, 0, false);

        const trim = this.mat({ color: 0x242424, roughness: 0.45, metalness: 0.7 });
        [-7.86, 7.86].forEach(x => this.box(0.08, 0.16, d, trim, x, baseY + 0.08, cz, 0, false));
        this.box(w, 0.16, 0.08, trim, 0, baseY + 0.08, -24.86, 0, false);

        this.addCollider(-8, cz, 0.3, d, baseY, baseY + h);
        this.addCollider(8, cz, 0.3, d, baseY, baseY + h);
        this.addCollider(0, -25, w, 0.3, baseY, baseY + h);
        this.addCollider(-4.8, -10, 6.4, 0.3, baseY, baseY + h);
        this.addCollider(4.8, -10, 6.4, 0.3, baseY, baseY + h);

        const plinthMat = this.mat({ color: 0x171719, roughness: 0.38, metalness: 0.58 });
        const topMat = this.mat({ color: 0x77777d, roughness: 0.28, metalness: 0.82 });
        const displayPoints = [
            [-5.6, -13.2], [5.6, -13.2],
            [-5.6, -18.2], [5.6, -18.2],
            [-5.6, -22.5], [5.6, -22.5]
        ];
        displayPoints.forEach(([x, z], index) => {
            const pedestal = new THREE.Group();
            const foot = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.12, 1.35), this.matBlack);
            foot.position.y = 0.06;
            const column = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.62, 1.12), plinthMat);
            column.position.y = 0.43;
            const cap = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.08, 1.3), topMat);
            cap.position.y = 0.78;
            pedestal.add(foot, column, cap);
            pedestal.position.set(x, baseY, z);
            this.scene.add(pedestal);
            this.addCollider(x, z, 1.25, 1.25, baseY, baseY + 0.9);

            if (!this.isMobile) {
                const accent = new THREE.PointLight(index % 2 ? 0x9aa8c8 : 0xd7d7df, 1.2, 3.5, 2);
                accent.position.set(x, baseY + 2.7, z);
                this.scene.add(accent);
            }
        });

        const rail = this.box(13.5, 0.08, 0.12, this.matBlack, 0, baseY + h - 0.22, -17.5, 0, false);
        rail.castShadow = false;

        if (!this.isMobile) {
            [-5.5, 0, 5.5].forEach(x => {
                const spot = new THREE.SpotLight(0xf0f2ff, 22, 9, Math.PI / 7, 0.55, 1.4);
                spot.position.set(x, baseY + h - 0.35, -17.5);
                spot.target.position.set(x, baseY + 0.8, -17.5);
                this.scene.add(spot, spot.target);
            });
        }
    }

    createStairs() {
        const steps = STAIR_STEPS;
        const stairWidth = 1.9;
        const startZ = STAIR_START_Z;
        const run = STAIR_RUN;
        const rise = GALLERY_FLOOR_Y / steps;
        const stepRun = run / steps;
        const treadDepth = stepRun + 0.035;
        const treadMat = this.mat({ map: makeWoodTexture(0x6b4528), roughness: 0.72 });
        const riserMat = this.mat({ color: 0x242424, roughness: 0.62, metalness: 0.35 });

        for (let i = 0; i < steps; i++) {
            const topY = (i + 1) * rise;
            const z = startZ - (i + 0.5) * stepRun;

            const tread = new THREE.Mesh(new THREE.BoxGeometry(stairWidth, 0.12, treadDepth), treadMat);
            tread.position.set(0, topY - 0.06, z);
            tread.castShadow = !this.isMobile;
            tread.receiveShadow = !this.isMobile;
            this.scene.add(tread);

            const riser = new THREE.Mesh(new THREE.BoxGeometry(stairWidth, rise, 0.07), riserMat);
            riser.position.set(0, topY - rise / 2, z - treadDepth / 2 + 0.035);
            this.scene.add(riser);
        }

        const slope = Math.atan2(GALLERY_FLOOR_Y, run);
        const stairCenterZ = startZ - run / 2;
        [-1.08, 1.08].forEach(x => {
            const beam = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.22, run + 0.3), this.matMetal);
            beam.position.set(x, GALLERY_FLOOR_Y / 2 - 0.2, stairCenterZ);
            beam.rotation.x = slope;
            this.scene.add(beam);

            const postCount = 7;
            for (let i = 0; i < postCount; i++) {
                const t = (i + 0.5) / postCount;
                const z = startZ - t * run;
                const y = t * GALLERY_FLOOR_Y + 0.48;
                const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.9, this.isMobile ? 5 : 6), this.matMetal);
                post.position.set(x, y, z);
                this.scene.add(post);
            }

            const handrail = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, run + 0.3), this.matMetal);
            handrail.position.set(x, GALLERY_FLOOR_Y / 2 + 0.72, stairCenterZ);
            handrail.rotation.x = slope;
            this.scene.add(handrail);
        });

        const glassRailMat = this.isMobile
            ? new THREE.MeshBasicMaterial({
                color: 0xbcccd8, transparent: true, opacity: 0.18,
                side: THREE.DoubleSide, depthWrite: false
            })
            : new THREE.MeshStandardMaterial({
                color: 0xbcccd8, transparent: true, opacity: 0.24, roughness: 0.1
            });
        const glassRail = this.isMobile
            ? new THREE.Mesh(new THREE.PlaneGeometry(run + 0.15, 0.82), glassRailMat)
            : new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.82, run + 0.15), glassRailMat);
        glassRail.position.set(0.98, GALLERY_FLOOR_Y / 2 + 0.72, stairCenterZ);
        if (this.isMobile) {
            glassRail.rotation.order = 'YXZ';
            glassRail.rotation.y = Math.PI / 2;
            glassRail.rotation.x = -slope;
        } else {
            glassRail.rotation.x = slope;
        }
        this.scene.add(glassRail);

        this.addCollider(-1.25, stairCenterZ, 0.12, run + 0.25, 0, GALLERY_FLOOR_Y + 0.8);
        this.addCollider(1.25, stairCenterZ, 0.12, run + 0.25, 0, GALLERY_FLOOR_Y + 0.8);
    }

    createWalls() {
        const doorL = 3.1, doorR = 4.7, doorH = 2.4;

        const lowerWallH = 2.725;
        const leftW = doorL - (-8);
        this.box(leftW, lowerWallH, 0.22, this.matConcreteWall,
            -8 + leftW / 2, lowerWallH / 2, -10);

        const rightW = 8 - doorR;
        this.box(rightW, lowerWallH, 0.22, this.matConcreteWall,
            doorR + rightW / 2, lowerWallH / 2, -10);

        const lintelH = lowerWallH - doorH;
        const lintel = new THREE.Mesh(new THREE.BoxGeometry(doorR - doorL, lintelH, 0.22), this.matConcreteWall);
        lintel.position.set((doorL + doorR) / 2, doorH + lintelH / 2, -10);
        this.scene.add(lintel);

        this.addCollider(-8 + leftW / 2, -10, leftW, 0.3, 0, lowerWallH);
        this.addCollider(doorR + rightW / 2, -10, rightW, 0.3, 0, lowerWallH);
        this.addCollider((doorL + doorR) / 2, -10, doorR - doorL, 0.3, doorH, GALLERY_FLOOR_Y);

        const upperBandH = GALLERY_FLOOR_Y - lowerWallH;
        this.box(6.4, upperBandH, 0.22, this.matConcreteWall, -4.8, lowerWallH + upperBandH / 2, -10);
        this.box(1.6, upperBandH, 0.22, this.matConcreteWall, 3.9, lowerWallH + upperBandH / 2, -10);

        this.box(0.22, 6, 20, this.matConcreteWall, -8, 3, 0);
        this.addCollider(-8, 0, 0.3, 20, 0, 6);

        this.box(16, 6, 0.22, this.matConcreteWall, 0, 3, 10.1);
        this.addCollider(0, 10.1, 16, 0.3, 0, 6);

        const windowFrame = new THREE.Mesh(new THREE.BoxGeometry(3, 2, 0.2), this.matBlack);
        windowFrame.position.set(0, 3, 10.1);
        this.scene.add(windowFrame);
        const glass = new THREE.Mesh(
            new THREE.PlaneGeometry(2.8, 1.8),
            this.isMobile
                ? new THREE.MeshBasicMaterial({ color: 0xbcccd8, transparent: true, opacity: 0.26, side: THREE.DoubleSide, depthWrite: false })
                : new THREE.MeshStandardMaterial({ color: 0xbcccd8, transparent: true, opacity: 0.38, side: THREE.DoubleSide })
        );
        glass.position.set(0, 3, 10);
        glass.rotation.y = Math.PI;
        this.scene.add(glass);

        const glassMat = this.isMobile
            ? new THREE.MeshBasicMaterial({
                color: 0xc8d7e4,
                transparent: true,
                opacity: 0.16,
                side: THREE.DoubleSide,
                depthWrite: false
            })
            : new THREE.MeshStandardMaterial({
                color: 0xc8d7e4, metalness: 0.1, roughness: 0.08,
                transparent: true, opacity: 0.24, side: THREE.DoubleSide
            });
        const frameMat = this.matBlack;
        const addGlassPanel = (z, length, x = 8) => {
            if (this.isMobile) {
                const panel = new THREE.Mesh(new THREE.PlaneGeometry(length, 5.55), glassMat);
                panel.position.set(x, 2.8, z);
                panel.rotation.y = Math.PI / 2;
                this.scene.add(panel);
            } else {
                const panel = new THREE.Mesh(new THREE.BoxGeometry(0.045, 5.55, length), glassMat);
                panel.position.set(x, 2.8, z);
                this.scene.add(panel);
            }
        };

        if (this.isMobile) {
            // Painéis sem sobreposição para eliminar overdraw duplo na porta de vidro
            addGlassPanel(-6.5, 7.0, 8);
            addGlassPanel(6.5, 7.0, 8);
            addGlassPanel(-2.2, 1.6, 7.94);
            addGlassPanel(2.2, 1.6, 7.94);
        } else {
            addGlassPanel(-5.7, 8.6);
            addGlassPanel(5.7, 8.6);
            addGlassPanel(-2.25, 1.45, 7.94);
            addGlassPanel(2.25, 1.45, 7.94);
        }

        this.box(0.12, 0.12, 20, frameMat, 8, 5.62, 0);
        this.box(0.12, 0.12, 20, frameMat, 8, 0.08, 0);
        [-10, -1.4, 1.4, 10].forEach(z => this.box(0.12, 5.6, 0.12, frameMat, 8, 2.8, z));
        [-3.0, 3.0].forEach(z => this.box(0.08, 5.4, 0.08, frameMat, 8, 2.8, z));

        this.box(0.18, 0.045, 3.4, this.matMetal, 8, 5.72, 0);
        this.box(0.18, 0.045, 3.4, this.matMetal, 8, 5.66, 0);
    }

    createMezzanine() {
        const tex = makeWoodTexture();
        tex.repeat.set(2, 2);
        const slabDepth = 6.8;
        const slabCenterZ = -6.6;
        const slab = new THREE.Mesh(
            new THREE.BoxGeometry(16, 0.25, slabDepth),
            this.mat({ map: tex, roughness: 0.9 })
        );
        slab.position.set(0, GALLERY_FLOOR_Y - 0.125, slabCenterZ);
        slab.castShadow = !this.isMobile;
        slab.receiveShadow = !this.isMobile;
        this.scene.add(slab);

        this.box(0.3, 0.4, slabDepth, this.matMetal, -7.85, GALLERY_FLOOR_Y - 0.275, slabCenterZ);
        this.box(0.3, 0.4, slabDepth, this.matMetal, 7.85, GALLERY_FLOOR_Y - 0.275, slabCenterZ);
        this.box(16, 0.4, 0.3, this.matMetal, 0, GALLERY_FLOOR_Y - 0.275, -3.15);

        const railBase = GALLERY_FLOOR_Y;
        const addRail = (horizontal, fixed, from, to) => {
            for (let p = from; p <= to; p += 1.1) {
                const post = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.95, 0.05), this.matMetal);
                post.position.set(horizontal ? p : fixed, railBase + 0.475, horizontal ? fixed : p);
                this.scene.add(post);
            }
            for (let i = 0; i < 3; i++) {
                const bar = new THREE.Mesh(
                    horizontal ? new THREE.BoxGeometry(to - from, 0.04, 0.04) : new THREE.BoxGeometry(0.04, 0.04, to - from),
                    this.matMetal
                );
                bar.position.set(horizontal ? (from + to) / 2 : fixed, railBase + 0.15 + i * 0.3, horizontal ? fixed : (from + to) / 2);
                this.scene.add(bar);
            }
        };

        addRail(true, -3.2, -7.9, -1.2);
        addRail(true, -3.2, 1.2, 7.9);
        addRail(false, -7.85, -9.9, -3.2);
        addRail(false, 7.85, -9.9, -3.2);
        this.addCollider(-7.85, -6.6, 0.15, slabDepth, railBase, railBase + 1.0);
        this.addCollider(7.85, -6.6, 0.15, slabDepth, railBase, railBase + 1.0);
        this.addCollider(-4.55, -3.2, 6.7, 0.15, railBase, railBase + 1.0);
        this.addCollider(4.55, -3.2, 6.7, 0.15, railBase, railBase + 1.0);

        const levelOffset = GALLERY_FLOOR_Y - 2.725;
        const bedG = new THREE.Group();
        const frame = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.3, 2.6), this.matMetal);
        const mattress = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.35, 2.4), this.mat({ color: 0x1e1e1e, roughness: 1 }));
        mattress.position.y = 0.32;
        const pillow = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.2, 0.45), this.mat({ color: 0x555555, roughness: 1 }));
        pillow.position.set(0, 0.55, -0.85);
        const blanket = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.16, 1.5), this.mat({ color: 0x3a3f45, roughness: 1 }));
        blanket.position.set(0, 0.5, 0.35);
        frame.add(mattress, pillow, blanket);
        bedG.add(frame);
        bedG.position.set(-6.4, 2.88 + levelOffset, -7);
        if (!this.isMobile) bedG.traverse(o => { o.castShadow = true; });
        this.scene.add(bedG);
        this.addCollider(-6.4, -7, 2.2, 2.9, railBase, railBase + 1.0);

        const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.1, 0.22, this.isMobile ? 6 : 8), this.matDarkGray);
        pot.position.set(-1.3, 2.85 + levelOffset, -4.1);
        this.scene.add(pot);
        const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 6), this.mat({ color: 0x2f4f2f, roughness: 1 }));
        leaf.position.set(-1.3, 3.05 + levelOffset, -4.1);
        leaf.scale.y = 1.5;
        this.scene.add(leaf);
    }

    createKitchen() {
        this.box(6.5, 0.85, 0.6, this.matBlack, -4.7, 0.42, -9.5);
        this.box(6.5, 0.06, 0.68, this.mat({ color: 0x4a4a48, roughness: 0.4 }), -4.7, 0.88, -9.5);
        this.addCollider(-4.7, -9.5, 6.5, 0.7);

        this.box(0.85, 1.9, 0.65, this.mat({ color: 0x303030, roughness: 0.3, metalness: 0.7 }), -0.9, 0.95, -9.5);
        this.addCollider(-0.9, -9.5, 0.95, 0.75);

        for (let i = 0; i < 2; i++) {
            const sh = new THREE.Mesh(new THREE.BoxGeometry(3, 0.05, 0.4), this.matWood);
            sh.position.set(-6.4, 1.5 + i * 0.6, -9.6);
            this.scene.add(sh);
            for (let j = 0; j < 3; j++) {
                const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.06, 0.14, 6), this.matDarkGray);
                pot.position.set(-7.6 + j * 1.1, 1.6 + i * 0.6, -9.6);
                this.scene.add(pot);
            }
        }

        const islandTex = makeConcreteTexture(0x7d7b78);
        const island = new THREE.Mesh(new THREE.BoxGeometry(3, 0.85, 1.1), this.mat({ map: islandTex, roughness: 0.9 }));
        island.position.set(-4.5, 0.42, -6.8);
        island.castShadow = !this.isMobile;
        island.receiveShadow = !this.isMobile;
        this.scene.add(island);
        this.addCollider(-4.5, -6.8, 3, 1.1);

        this.box(0.6, 0.04, 0.45, this.matMetal, -4.5, 0.87, -6.8);
        const faucet = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.025, 6, 10, Math.PI), this.matMetal);
        faucet.position.set(-4.5, 1.1, -7.05);
        this.scene.add(faucet);

        const stoolSeatMat = this.mat({ color: 0x5a3a28, roughness: 0.8 });
        for (let i = 0; i < 3; i++) {
            const g = new THREE.Group();
            const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.05, this.isMobile ? 8 : 10), stoolSeatMat);
            seat.position.y = 0.62;
            g.add(seat);
            for (let l = 0; l < 3; l++) {
                const a = (l / 3) * Math.PI * 2;
                const leg = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.62, 0.035), this.matMetal);
                leg.position.set(Math.cos(a) * 0.13, 0.31, Math.sin(a) * 0.13);
                g.add(leg);
            }
            g.position.set(-5.6 + i * 1.1, 0, -5.9);
            if (!this.isMobile) g.traverse(o => { o.castShadow = true; });
            this.scene.add(g);
        }

        const plantLeafMat = this.mat({ color: 0x2e4d2e, roughness: 1 });
        [[-7.3, -3.5], [-2.2, -9]].forEach(([x, z]) => {
            const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.22, 0.4, this.isMobile ? 6 : 8), this.matDarkGray);
            pot.position.set(x, 0.2, z);
            pot.castShadow = !this.isMobile;
            this.scene.add(pot);
            for (let l = 0; l < 6; l++) {
                const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.9, this.isMobile ? 4 : 5), plantLeafMat);
                leaf.position.set(x + Math.random() * 0.25 - 0.12, 0.75, z + Math.random() * 0.25 - 0.12);
                leaf.rotation.z = Math.random() * 0.6 - 0.3;
                leaf.rotation.x = Math.random() * 0.6 - 0.3;
                this.scene.add(leaf);
            }
        });
    }

    createLivingArea() {
        const rug = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 2.4), this.mat({ color: 0x222222, roughness: 1 }));
        rug.rotation.x = -Math.PI / 2;
        rug.position.set(4, 0.01, 4.2);
        rug.receiveShadow = !this.isMobile;
        this.scene.add(rug);

        const sofaMat = this.mat({ color: 0x181818, roughness: 1 });
        const cushionMat = this.mat({ color: 0x2c2c2c, roughness: 1 });
        this.box(1.2, 0.4, 2.8, sofaMat, 5.3, 0.28, 4);
        this.box(0.3, 0.6, 2.8, sofaMat, 5.95, 0.55, 4);
        this.box(2.4, 0.4, 1.1, sofaMat, 4.5, 0.28, 2.85);
        this.box(2.4, 0.6, 0.3, sofaMat, 4.5, 0.55, 2.35);
        for (let i = 0; i < 3; i++) {
            this.box(0.85, 0.16, 0.9, cushionMat, 5.3, 0.55, 3 + i * 0.95);
        }
        this.addCollider(5.5, 4, 1.6, 3);
        this.addCollider(4.5, 2.85, 2.6, 1.3);

        this.box(1.1, 0.05, 0.7, this.matBlack, 3.2, 0.36, 4.6);
        this.box(0.95, 0.04, 0.55, this.matWood, 3.2, 0.1, 4.6);
        [[2.75, 4.35], [3.65, 4.35], [2.75, 4.85], [3.65, 4.85]].forEach(([x, z]) => {
            const leg = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.36, 0.045), this.matBlack);
            leg.position.set(x, 0.18, z);
            this.scene.add(leg);
        });
        const vase = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.16, 6), this.matDarkGray);
        vase.position.set(3.2, 0.47, 4.6);
        this.scene.add(vase);
        this.addCollider(3.2, 4.6, 1.2, 0.8);
    }

    createLights() {
        if (this.isMobile) {
            // Iluminação global leve sem PointLights (mantém o interior e a praia claros sem custo de shader)
            const hemi = new THREE.HemisphereLight(0xdcebff, 0x6b6257, 1.55);
            this.scene.add(hemi);

            const sun = new THREE.DirectionalLight(0xfff2e0, 1.25);
            sun.position.set(14, 10, 4);
            this.scene.add(sun);
        } else {
            this.scene.add(new THREE.AmbientLight(0x30343c, 1.2));

            const sun = new THREE.DirectionalLight(0xfff2e0, 2.4);
            sun.position.set(14, 8, 3);
            sun.target.position.set(-3, 0, 0);
            sun.castShadow = true;
            sun.shadow.mapSize.set(2048, 2048);
            sun.shadow.bias = -0.0005;
            sun.shadow.camera.near = 1;
            sun.shadow.camera.far = 45;
            sun.shadow.camera.left = -15;
            sun.shadow.camera.right = 15;
            sun.shadow.camera.top = 15;
            sun.shadow.camera.bottom = -15;
            this.scene.add(sun, sun.target);
        }

        [-5.6, -4.5, -3.4].forEach(x => {
            const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 6), new THREE.MeshBasicMaterial({ color: 0xffc98a }));
            bulb.position.set(x, 2.7, -6.8);
            this.scene.add(bulb);
            const cage = new THREE.Mesh(new THREE.SphereGeometry(0.13, 6, 5, 0, Math.PI * 2, 0, Math.PI * 0.7), this.matMetal);
            cage.position.copy(bulb.position);
            this.scene.add(cage);
            const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 3, 6), this.matBlack);
            wire.position.set(x, 4.4, -6.8);
            this.scene.add(wire);

            if (!this.isMobile) {
                const pt = new THREE.PointLight(0xffb46a, 8, 6, 2);
                pt.position.set(x, 2.6, -6.8);
                this.scene.add(pt);
            }
        });

        if (!this.isMobile) {
            const fill = new THREE.PointLight(0x8fa3bf, 14, 18, 2);
            fill.position.set(7, 4, 2);
            this.scene.add(fill);
        }
    }
}