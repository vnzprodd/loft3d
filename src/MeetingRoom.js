import * as THREE from 'three';
import { makeWoodTexture, makeConcreteTexture } from './World.js';
import { Whiteboard } from './Whiteboard.js';

const isMobileDevice = () =>
    typeof window !== 'undefined' &&
    (window.matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent));

export class MeetingRoom {
    constructor(scene, world) {
        this.scene = scene;
        this.world = world;
        this.isMobile = isMobileDevice();

        this.x0 = 0.5;
        this.x1 = 12;
        this.z0 = -25;
        this.z1 = -10;
        this.ceilH = 3.6;

        this.chairs = [];

        this.build();
        this.buildFurniture();
        this.buildLights();

        if (this.isMobile) {
            const boardCanvas = document.getElementById('board-canvas');
            if (boardCanvas && boardCanvas.width > 1024) {
                boardCanvas.width = 1024;
                boardCanvas.height = 512;
            }
        }

        this.whiteboard = new Whiteboard(scene, {
            position: new THREE.Vector3((this.x0 + this.x1) / 2, 2.0, this.z0 + 0.22),
            width: 6,
            height: 2.5
        });
    }

    mat(opts) {
        if (this.isMobile) {
            const { roughness, metalness, ...rest } = opts;
            return new THREE.MeshLambertMaterial(rest);
        }
        return new THREE.MeshStandardMaterial(opts);
    }

    build() {
        const w = this.x1 - this.x0;
        const d = this.z1 - this.z0;
        const cx = (this.x0 + this.x1) / 2;
        const cz = (this.z0 + this.z1) / 2;

        const carpet = makeConcreteTexture(0x9c9891);
        carpet.repeat.set(6, 8);
        const floor = new THREE.Mesh(
            new THREE.PlaneGeometry(w, d),
            this.mat({ map: carpet, roughness: 1 })
        );
        floor.rotation.x = -Math.PI / 2;
        floor.position.set(cx, 0.005, cz);
        this.scene.add(floor);

        const ceilTex = makeWoodTexture();
        ceilTex.repeat.set(3, 4);
        const ceil = new THREE.Mesh(
            new THREE.PlaneGeometry(w, d),
            this.mat({ map: ceilTex, roughness: 0.9 })
        );
        ceil.rotation.x = Math.PI / 2;
        ceil.position.set(cx, this.ceilH, cz);
        this.scene.add(ceil);

        const wallMat = this.mat({
            map: makeConcreteTexture(0x8d8b87),
            roughness: 1,
            side: THREE.DoubleSide
        });

        const addSolidWall = (width, height, depth, x, y, z) => {
            const wall = new THREE.Mesh(
                new THREE.BoxGeometry(width, height, depth),
                wallMat
            );
            wall.position.set(x, y, z);
            this.scene.add(wall);
            this.world.addCollider(x, z, width, depth, 0, height);
            return wall;
        };

        addSolidWall(0.22, this.ceilH, d, this.x0, this.ceilH / 2, cz);
        addSolidWall(0.22, this.ceilH, d, this.x1, this.ceilH / 2, cz);
        addSolidWall(w, this.ceilH, 0.22, cx, this.ceilH / 2, this.z0);

        const extensionWidth = Math.max(0, this.x1 - 8);
        if (extensionWidth > 0) {
            addSolidWall(
                extensionWidth, this.ceilH, 0.22,
                8 + extensionWidth / 2, this.ceilH / 2, this.z1
            );
        }

        const skirtMat = this.mat({ color: 0x3a3a38, roughness: 0.8 });
        const skirt = (bw, bx, bz, rotY) => {
            const s = new THREE.Mesh(new THREE.BoxGeometry(bw, 0.12, 0.04), skirtMat);
            s.position.set(bx, 0.06, bz);
            s.rotation.y = rotY;
            this.scene.add(s);
        };
        skirt(d, this.x0 + 0.12, cz, Math.PI / 2);
        skirt(d, this.x1 - 0.12, cz, Math.PI / 2);
        skirt(w, cx, this.z0 + 0.12, 0);

        const jambMat = this.mat({ color: 0x1c1c1c, roughness: 0.4, metalness: 0.7 });
        [3.1, 4.7].forEach(x => {
            const j = new THREE.Mesh(new THREE.BoxGeometry(0.09, 2.45, 0.26), jambMat);
            j.position.set(x, 1.22, -10);
            this.scene.add(j);
        });
        const head = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.09, 0.26), jambMat);
        head.position.set(3.9, 2.42, -10);
        this.scene.add(head);
    }

    buildFurniture() {
        const cx = (this.x0 + this.x1) / 2;
        const tableZ = -17.5;

        const tableTex = makeWoodTexture(0xc79a5b);
        tableTex.repeat.set(3, 1);
        const tableMat = this.mat({ map: tableTex, roughness: 0.7 });
        const top = new THREE.Mesh(new THREE.BoxGeometry(6.0, 0.09, 2.0), tableMat);
        top.position.set(cx, 0.74, tableZ);
        this.scene.add(top);

        const apronMat = this.mat({ color: 0xa87f47, roughness: 0.8 });
        const apron = new THREE.Mesh(new THREE.BoxGeometry(5.7, 0.12, 1.75), apronMat);
        apron.position.set(cx, 0.66, tableZ);
        this.scene.add(apron);

        const legMat = this.mat({ color: 0x2a2a2a, roughness: 0.5, metalness: 0.4 });
        [[-2.7, -0.7], [2.7, -0.7], [-2.7, 0.7], [2.7, 0.7]].forEach(([dx, dz]) => {
            const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.7, 0.1), legMat);
            leg.position.set(cx + dx, 0.35, tableZ + dz);
            this.scene.add(leg);
        });
        this.world.addCollider(cx, tableZ, 6.0, 2.0, 0, 0.85);

        const matSeat = this.mat({ color: 0x151515, roughness: 0.85 });
        const seg = this.isMobile ? 5 : 6;
        const chairAt = (x, z, ry) => {
            const g = new THREE.Group();

            const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.48), matSeat);
            seat.position.y = 0.46;
            const back = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.52, 0.07), matSeat);
            back.position.set(0, 0.74, -0.23);
            const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.36, seg), legMat);
            stem.position.y = 0.28;
            const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.05, seg), legMat);
            hub.position.y = 0.1;
            g.add(seat, back, stem, hub);

            for (let i = 0; i < 5; i++) {
                const a = (i / 5) * Math.PI * 2;
                const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.035, 0.045), legMat);
                spoke.position.set(Math.cos(a) * 0.16, 0.08, Math.sin(a) * 0.16);
                spoke.rotation.y = -a;
                const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.03, seg), matSeat);
                wheel.position.set(Math.cos(a) * 0.3, 0.045, Math.sin(a) * 0.3);
                g.add(spoke, wheel);
            }

            [-0.24, 0.24].forEach(dx => {
                const arm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.34), matSeat);
                arm.position.set(dx, 0.62, -0.04);
                g.add(arm);
            });

            g.position.set(x, 0, z);
            g.rotation.y = ry;
            this.scene.add(g);
            this.world.addCollider(x, z, 0.62, 0.62, 0, 1.05);

            this.chairs.push({ position: new THREE.Vector3(x, 0, z), rotation: ry });
        };

        const chairOffsetsX = [-2.15, -0.72, 0.72, 2.15];
        chairOffsetsX.forEach(offsetX => {
            chairAt(cx + offsetX, tableZ - 2.25, 0);
            chairAt(cx + offsetX, tableZ + 2.25, Math.PI);
        });

        const laptopBase = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.02, 0.3), legMat);
        laptopBase.position.set(cx - 0.3, 0.8, tableZ + 0.1);
        laptopBase.rotation.y = 0.25;
        const laptopLid = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.28, 0.015), legMat);
        laptopLid.position.set(cx - 0.42, 0.94, tableZ - 0.04);
        laptopLid.rotation.set(-0.25, 0.25, 0);
        const screenGlow = new THREE.Mesh(
            new THREE.PlaneGeometry(0.38, 0.24),
            new THREE.MeshBasicMaterial({ color: 0x2b3b52 })
        );
        screenGlow.position.set(cx - 0.4, 0.94, tableZ - 0.02);
        screenGlow.rotation.set(-0.25, 0.25, 0);
        this.scene.add(laptopBase, laptopLid, screenGlow);

        const potMat = this.mat({ color: 0x7d7a74, roughness: 0.9 });
        const leafMat = this.mat({ color: 0x35672f, roughness: 1 });
        [[this.x0 + 0.7, this.z0 + 0.9], [this.x1 - 0.7, this.z0 + 0.9]].forEach(([x, z]) => {
            const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.17, 0.42, this.isMobile ? 6 : 8), potMat);
            pot.position.set(x, 0.21, z);
            this.scene.add(pot);
            for (let i = 0; i < 7; i++) {
                const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.85, this.isMobile ? 4 : 5), leafMat);
                const a = (i / 7) * Math.PI * 2;
                leaf.position.set(x + Math.cos(a) * 0.18, 0.85, z + Math.sin(a) * 0.18);
                leaf.rotation.set(Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35);
                this.scene.add(leaf);
            }
            this.world.addCollider(x, z, 0.5, 0.5, 0, 1.3);
        });
    }

    buildLights() {
        const cx = (this.x0 + this.x1) / 2;

        [-1.5, 1.5].forEach(dx => {
            const shade = new THREE.Mesh(
                new THREE.ConeGeometry(0.22, 0.24, this.isMobile ? 7 : 10, 1, true),
                this.mat({ color: 0x1a1a1a, roughness: 0.5, metalness: 0.5, side: THREE.DoubleSide })
            );
            shade.position.set(cx + dx, 2.85, -17.5);
            this.scene.add(shade);

            const bulb = new THREE.Mesh(
                new THREE.SphereGeometry(0.055, 6, 6),
                new THREE.MeshBasicMaterial({ color: 0xffd6a0 })
            );
            bulb.position.set(cx + dx, 2.78, -17.5);
            this.scene.add(bulb);

            const wire = new THREE.Mesh(
                new THREE.CylinderGeometry(0.008, 0.008, this.ceilH - 2.95, 5),
                this.mat({ color: 0x111111 })
            );
            wire.position.set(cx + dx, (this.ceilH + 2.95) / 2, -17.5);
            this.scene.add(wire);

            if (!this.isMobile) {
                const pt = new THREE.PointLight(0xffc98a, 9, 8, 2);
                pt.position.set(cx + dx, 2.7, -17.5);
                this.scene.add(pt);
            }
        });

        if (!this.isMobile) {
            const wash = new THREE.SpotLight(0xffffff, 16, 9, Math.PI / 5, 0.5, 1.6);
            wash.position.set(cx, this.ceilH - 0.1, this.z0 + 1.6);
            wash.target.position.set(cx, 1.6, this.z0);
            this.scene.add(wash, wash.target);
        }

        const tvFrameMat = this.mat({
            color: 0x090a0c, roughness: 0.38, metalness: 0.72
        });
        const tvFrame = new THREE.Mesh(
            new THREE.BoxGeometry(0.10, 1.98, 3.18),
            tvFrameMat
        );
        tvFrame.position.set(this.x0 + 0.25, 2.0, -17.5);
        this.scene.add(tvFrame);

        const screenMat = new THREE.MeshBasicMaterial({
            color: 0x0b0d10, side: THREE.DoubleSide, toneMapped: false
        });
        this.transmissionScreen = new THREE.Mesh(
            new THREE.PlaneGeometry(2.96, 1.76),
            screenMat
        );
        this.transmissionScreen.position.set(this.x0 + 0.31, 2.0, -17.5);
        this.transmissionScreen.rotation.y = Math.PI / 2;
        this.scene.add(this.transmissionScreen);

        if (!this.isMobile) {
            const glow = new THREE.PointLight(0x4466ff, 2.2, 4.5);
            glow.position.set(this.x0 + 0.42, 2.0, -17.5);
            this.scene.add(glow);

            const fill = new THREE.PointLight(0xdfe6f0, 8, 15, 1.8);
            fill.position.set(cx, 2.9, -17.5);
            this.scene.add(fill);
        }
    }

    update(playerPos) {
        if (this.isMobile && this.transmissionScreen) {
            this.transmissionScreen.visible = playerPos.z < -8.5 && playerPos.x > -1;
        }
        this.whiteboard.update(playerPos);
    }
}