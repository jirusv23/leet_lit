import Phaser from 'phaser';

const WORLD_SIZE   = 10000000;
const SHIP_SIZE    = 20;
const STATION_SIZE = 150;

// ─────────────────────────────────────────────────────────────────────────────
//  TRANSITION SCENE  (zoom-fly-in / zoom-fly-out)
// ─────────────────────────────────────────────────────────────────────────────
class TransitionScene extends Phaser.Scene {
    constructor() { super({ key: 'TransitionScene' }); }

    create(data: {
        direction: 'in' | 'out';
        nextScene: string;
        nextData: Record<string, unknown>;
        stationX?: number; stationY?: number;
        stationStyle?: number;
    }) {
        const W = this.scale.width, H = this.scale.height;
        const dir = data.direction;

        // Draw a representative station silhouette for the zoom target
        const g = this.add.graphics();
        const style = data.stationStyle ?? 0;

        if (dir === 'in') {
            // Start fully black, reveal station, zoom in to white flash
            g.fillStyle(0x000000, 1); g.fillRect(0, 0, W, H);
            const stg = this.add.graphics().setAlpha(0);
            drawStationSilhouette(stg, style, W / 2, H / 2, 60);

            this.tweens.add({
                targets: stg, alpha: 1, duration: 500, ease: 'Power2',
                onComplete: () => {
                    this.tweens.add({
                        targets: stg, scaleX: 8, scaleY: 8, alpha: 0,
                        duration: 700, ease: 'Power3',
                        onComplete: () => {
                            const flash = this.add.graphics();
                            flash.fillStyle(0xffffff, 1); flash.fillRect(0, 0, W, H);
                            this.tweens.add({
                                targets: flash, alpha: 0, duration: 300,
                                onComplete: () => {
                                    this.scene.stop();
                                    this.scene.start(data.nextScene, data.nextData);
                                }
                            });
                        }
                    });
                }
            });
            // Fade out the black bg
            this.tweens.add({ targets: g, alpha: 0, duration: 400, delay: 200 });

        } else {
            // Zoom out: white flash first, then reveal stars pulling back, fade to black
            g.fillStyle(0xffffff, 1); g.fillRect(0, 0, W, H);
            const stg = this.add.graphics().setAlpha(0).setScale(8);
            drawStationSilhouette(stg, style, W / 2, H / 2, 60);

            this.tweens.add({
                targets: g, alpha: 0, duration: 300,
                onComplete: () => {
                    this.tweens.add({
                        targets: stg, alpha: 1, duration: 200, ease: 'Power2',
                    });
                    this.tweens.add({
                        targets: stg, scaleX: 1, scaleY: 1, duration: 700, ease: 'Power3',
                        onComplete: () => {
                            const black = this.add.graphics().setAlpha(0);
                            black.fillStyle(0x000000, 1); black.fillRect(0, 0, W, H);
                            this.tweens.add({
                                targets: black, alpha: 1, duration: 400,
                                onComplete: () => {
                                    this.scene.stop();
                                    this.scene.start(data.nextScene, data.nextData);
                                }
                            });
                        }
                    });
                }
            });
        }
    }
}

function drawStationSilhouette(g: Phaser.GameObjects.Graphics, style: number, cx: number, cy: number, r: number) {
    g.lineStyle(3, 0xffffff, 0.8);
    g.fillStyle(0x111111, 0.9);
    // Jet-like silhouette
    const wings = 4 + (style % 3);
    for (let i = 0; i < wings * 2; i++) {
        const a = (i / (wings * 2)) * Math.PI * 2;
        const rr = i % 2 === 0 ? r : r * 0.65;
        const pts = [
            new Phaser.Math.Vector2(cx + Math.cos(a - 0.18) * rr * 0.4, cy + Math.sin(a - 0.18) * rr * 0.4),
            new Phaser.Math.Vector2(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr),
            new Phaser.Math.Vector2(cx + Math.cos(a + 0.18) * rr * 0.4, cy + Math.sin(a + 0.18) * rr * 0.4),
        ];
        g.fillPoints(pts, true); g.strokePoints(pts, true);
    }
    g.fillStyle(0x222222, 1);
    g.fillCircle(cx, cy, r * 0.38);
    g.strokeCircle(cx, cy, r * 0.38);
    // Engine rings
    for (let ring = 1; ring <= 2; ring++) {
        g.lineStyle(2, 0xffffff, 0.3); g.strokeCircle(cx, cy, r * 0.15 * ring);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  STATION STYLE DEFINITIONS  (8 unique jet-inspired styles)
// ─────────────────────────────────────────────────────────────────────────────
interface StationStyle {
    name: string;
    bgColor: number;
    wallColor: number;
    accentColor: number;
    floorPattern: 'grid' | 'stripe' | 'dot' | 'chevron' | 'hex';
    architecture: 'brutalist' | 'sleek' | 'industrial' | 'organic' | 'military';
    bayCount: number;        // 30–60
    busyness: number;        // 0–1 (fraction of bays occupied by NPCs)
}

const STATION_STYLES: StationStyle[] = [
    { name: 'ORBITAL COMMAND',    bgColor: 0xfafafa, wallColor: 0x000000, accentColor: 0x222222, floorPattern: 'grid',    architecture: 'military',   bayCount: 48, busyness: 0.7 },
    { name: 'DEEP FRONTIER HUB',  bgColor: 0xf5f5f0, wallColor: 0x111111, accentColor: 0x333333, floorPattern: 'stripe',  architecture: 'industrial', bayCount: 36, busyness: 0.5 },
    { name: 'NOVA TRANSIT PORT',  bgColor: 0xffffff, wallColor: 0x000000, accentColor: 0x1a1a1a, floorPattern: 'chevron', architecture: 'sleek',      bayCount: 52, busyness: 0.8 },
    { name: 'VEGA CARRIER DECK',  bgColor: 0xf8f8f8, wallColor: 0x0a0a0a, accentColor: 0x2a2a2a, floorPattern: 'dot',    architecture: 'brutalist',  bayCount: 60, busyness: 0.9 },
    { name: 'OUTPOST SIGMA',      bgColor: 0xfcfcfc, wallColor: 0x080808, accentColor: 0x404040, floorPattern: 'hex',     architecture: 'organic',    bayCount: 32, busyness: 0.4 },
    { name: 'MERIDIAN SHIPYARD',  bgColor: 0xf0f0f0, wallColor: 0x000000, accentColor: 0x181818, floorPattern: 'grid',    architecture: 'industrial', bayCount: 44, busyness: 0.6 },
    { name: 'ECLIPSE STATION',    bgColor: 0xfafaf8, wallColor: 0x050505, accentColor: 0x282828, floorPattern: 'stripe',  architecture: 'sleek',      bayCount: 38, busyness: 0.75 },
    { name: 'IRON CITADEL',       bgColor: 0xf2f2f2, wallColor: 0x000000, accentColor: 0x1c1c1c, floorPattern: 'chevron',architecture: 'military',   bayCount: 56, busyness: 0.85 },
];

// ─────────────────────────────────────────────────────────────────────────────
//  GAME SCENE
// ─────────────────────────────────────────────────────────────────────────────
class GameScene extends Phaser.Scene {
    private ship!: Phaser.GameObjects.Container;
    private shipGraphics!: Phaser.GameObjects.Graphics;
    private thrustGraphics!: Phaser.GameObjects.Graphics;
    private stars: { sprite: Phaser.GameObjects.TileSprite; factor: number }[] = [];

    private keyW!: Phaser.Input.Keyboard.Key;
    private keyS!: Phaser.Input.Keyboard.Key;
    private keyN!: Phaser.Input.Keyboard.Key;
    private keyX!: Phaser.Input.Keyboard.Key;
    private keyE!: Phaser.Input.Keyboard.Key;
    private keyC!: Phaser.Input.Keyboard.Key;
    private key1!: Phaser.Input.Keyboard.Key;
    private key2!: Phaser.Input.Keyboard.Key;

    private velocity             = new Phaser.Math.Vector2(0, 0);
    private throttle             = 0;
    private readonly baseAcceleration = 4;

    private manualZoom: number | null = null;
    private autoZoomValue             = 1;
    private readonly ZOOM_SNAP_MARGIN = 0.15;

    private uiCamera!: Phaser.Cameras.Scene2D.Camera;
    private speedText!: Phaser.GameObjects.Text;
    private distText!: Phaser.GameObjects.Text;
    private hintText!: Phaser.GameObjects.Text;
    private commText!: Phaser.GameObjects.Text;
    private pointerDistText!: Phaser.GameObjects.Text;
    private zoomModeText!: Phaser.GameObjects.Text;
    private navArrow!: Phaser.GameObjects.Graphics;
    private moveArrow!: Phaser.GameObjects.Graphics;

    private stations: Phaser.GameObjects.Container[] = [];
    private stationStyleIndices: number[]             = [];
    private targetStation?: Phaser.GameObjects.Container;
    private targetIndex     = 0;
    private canEnterStation = false;

    private commStatus: 'none' | 'calling' | 'identifying' | 'scanning' | 'granted' = 'none';
    private commTimer       = 0;
    private assignedBayIndex = 0;

    constructor() { super({ key: 'GameScene' }); }

    create(data?: { returnX?: number; returnY?: number; returnVX?: number; returnVY?: number }) {
        this.cameras.main.setBackgroundColor('#ffffff');
        this.physics.world.setBounds(-WORLD_SIZE, -WORLD_SIZE, WORLD_SIZE * 2, WORLD_SIZE * 2);

        this.velocity.set(0, 0);
        this.throttle         = 0;
        this.commStatus       = 'none';
        this.commTimer        = 0;
        this.stations         = [];
        this.stationStyleIndices = [];
        this.stars            = [];
        this.manualZoom       = null;
        this.assignedBayIndex = 0;

        this.createStars();
        this.createStations(20);
        this.createShip();

        if (data?.returnX !== undefined) {
            this.ship.x = data.returnX;
            this.ship.y = data.returnY ?? 0;
            this.velocity.set(data.returnVX ?? 0, data.returnVY ?? 0);
        }

        this.cameras.main.startFollow(this.ship, true, 1, 1);

        this.uiCamera = this.cameras.add(0, 0, this.scale.width, this.scale.height)
            .setScroll(0, 0).setName('UI');

        this.speedText       = this.add.text(30, 30, '', { color: '#000', fontSize: '24px', fontStyle: 'bold' });
        this.distText        = this.add.text(30, 90, '', { color: '#000', fontSize: '20px' });
        this.commText        = this.add.text(this.scale.width / 2, this.scale.height - 120, '', {
            color: '#000', fontSize: '18px', fontStyle: 'bold',
            align: 'center', backgroundColor: '#fff', padding: { x: 10, y: 5 },
        }).setOrigin(0.5);
        this.hintText        = this.add.text(30, this.scale.height - 50,
            'W/S: THROTTLE  |  X: BRAKE  |  MOUSE: AIM  |  N: NEXT TARGET  |  C: COMMS  |  SCROLL: ZOOM',
            { color: '#000', fontSize: '16px' });
        this.pointerDistText = this.add.text(0, 0, '', {
            color: '#000', fontSize: '14px',
            backgroundColor: 'rgba(255,255,255,0.7)', padding: { x: 4, y: 2 },
        }).setOrigin(0.5, -0.2);
        this.zoomModeText    = this.add.text(this.scale.width - 30, 30, '', {
            color: '#000', fontSize: '14px', align: 'right',
        }).setOrigin(1, 0);

        this.navArrow  = this.add.graphics().setDepth(10);
        this.moveArrow = this.add.graphics().setDepth(11);

        const uiObjects = [
            this.speedText, this.distText, this.hintText, this.commText,
            this.pointerDistText, this.moveArrow, this.zoomModeText,
            ...this.stars.map(s => s.sprite),
        ];
        this.cameras.main.ignore(uiObjects);
        this.uiCamera.ignore([this.ship, this.navArrow, ...this.stations]);

        if (this.input.keyboard) {
            this.keyW = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W);
            this.keyS = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S);
            this.keyN = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.N);
            this.keyX = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.X);
            this.keyE = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
            this.keyC = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.C);
            this.key1 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ONE);
            this.key2 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.TWO);
        }

        this.input.on('wheel', (_p: any, _g: any, _dx: number, dy: number) => {
            const cur       = this.manualZoom ?? this.cameras.main.zoom;
            this.manualZoom = Phaser.Math.Clamp(cur * (dy > 0 ? 0.88 : 1.14), 0.004, 2);
        });
    }

    private createStars() {
        const layers = 5, baseF = 0.00002, sz = 1024;
        for (let i = 0; i < layers; i++) {
            const key = `stars_layer_${i}`;
            if (this.textures.exists(key)) this.textures.remove(key);
            const g = this.make.graphics({ x: 0, y: 0 });
            g.fillStyle(0x000000, 0.1 + i * 0.05);
            for (let j = 0; j < 8 + i * 4; j++)
                g.fillCircle(Phaser.Math.Between(0, sz), Phaser.Math.Between(0, sz), 1 + i * 0.8);
            g.generateTexture(key, sz, sz);
            g.destroy();
            this.stars.push({
                sprite: this.add.tileSprite(0, 0, this.scale.width, this.scale.height, key)
                    .setOrigin(0, 0).setScrollFactor(0).setDepth(-10 + i),
                factor: baseF * Math.pow(2.5, i),
            });
        }
    }

    private createStations(count: number) {
        for (let i = 0; i < count; i++) {
            const angle      = Math.random() * Math.PI * 2;
            const dist       = 50000 + Math.random() * (WORLD_SIZE / 3);
            const styleIdx   = i % STATION_STYLES.length;
            const style      = STATION_STYLES[styleIdx];
            const station    = this.add.container(Math.cos(angle) * dist, Math.sin(angle) * dist);
            const g          = this.add.graphics();

            // Jet-like station exterior — swept-wing silhouette
            this.drawJetStation(g, style, styleIdx);

            station.add(g);
            station.add(this.add.text(0, STATION_SIZE + 40, style.name, {
                color: '#000', fontSize: '20px', fontStyle: 'bold',
            }).setOrigin(0.5));
            this.stations.push(station);
            this.stationStyleIndices.push(styleIdx);
        }
        this.targetIndex   = 0;
        this.targetStation = this.stations[0];
    }

    private drawJetStation(g: Phaser.GameObjects.Graphics, style: StationStyle, styleIdx: number) {
        const S = STATION_SIZE;
        const seed = styleIdx * 7 + 3;

        // Central hull — elongated fuselage
        g.lineStyle(3, 0x000000, 1);
        g.fillStyle(0xffffff, 1);
        g.fillEllipse(0, 0, S * 0.9, S * 0.35);
        g.strokeEllipse(0, 0, S * 0.9, S * 0.35);

        // Swept wings (4 main)
        const wingAngles = [
            -Math.PI * 0.22, Math.PI * 0.22,
            Math.PI - Math.PI * 0.22, Math.PI + Math.PI * 0.22,
        ];
        wingAngles.forEach(wa => {
            const wx = Math.cos(wa) * S * 0.95;
            const wy = Math.sin(wa) * S * 0.65;
            const sweep = wa < 0 || (wa > Math.PI - 0.5 && wa < Math.PI + 0.5) ? -0.3 : 0.3;
            g.fillStyle(0xffffff, 1);
            g.fillTriangle(
                Math.cos(wa + sweep) * S * 0.2, Math.sin(wa + sweep) * S * 0.2,
                wx, wy,
                Math.cos(wa - sweep) * S * 0.2, Math.sin(wa - sweep) * S * 0.2
            );
            g.lineStyle(2.5, 0x000000, 1);
            g.strokeTriangle(
                Math.cos(wa + sweep) * S * 0.2, Math.sin(wa + sweep) * S * 0.2,
                wx, wy,
                Math.cos(wa - sweep) * S * 0.2, Math.sin(wa - sweep) * S * 0.2
            );
            // Wing tip detail
            g.fillStyle(0x000000, 0.8);
            g.fillCircle(wx * 0.92, wy * 0.92, 4);
        });

        // Secondary fins (style-dependent count)
        const finCount = 3 + (seed % 4);
        for (let f = 0; f < finCount; f++) {
            const fa = (f / finCount) * Math.PI * 2 + 0.4;
            const fr = S * 0.55;
            g.lineStyle(2, 0x000000, 0.6);
            g.strokeLineShape(new Phaser.Geom.Line(
                Math.cos(fa) * S * 0.18, Math.sin(fa) * S * 0.18,
                Math.cos(fa) * fr, Math.sin(fa) * fr
            ));
            g.fillStyle(0x000000, 0.5);
            g.fillRect(Math.cos(fa) * fr - 3, Math.sin(fa) * fr - 3, 6, 6);
        }

        // Central ring detail
        g.lineStyle(2, 0x000000, 0.5); g.strokeCircle(0, 0, S * 0.16);
        g.lineStyle(1.5, 0x000000, 0.3); g.strokeCircle(0, 0, S * 0.28);

        // Engine exhausts on the rear
        const nozzleCount = 2 + (seed % 3);
        for (let n = 0; n < nozzleCount; n++) {
            const na = Math.PI + (n - (nozzleCount - 1) / 2) * 0.28;
            const nx = Math.cos(na) * S * 0.38;
            const ny = Math.sin(na) * S * 0.15;
            g.fillStyle(0x111111, 1);
            g.fillEllipse(nx, ny, 14, 9);
            g.lineStyle(1.5, 0x000000, 1); g.strokeEllipse(nx, ny, 14, 9);
        }

        // Cockpit dome
        g.fillStyle(0x222222, 1);
        g.fillEllipse(S * 0.28, 0, 22, 14);
        g.lineStyle(1.5, 0x000000, 1); g.strokeEllipse(S * 0.28, 0, 22, 14);
    }

    private createShip() {
        this.ship           = this.add.container(0, 0);
        this.thrustGraphics = this.add.graphics();
        this.ship.add(this.thrustGraphics);
        this.shipGraphics   = this.add.graphics();
        this.drawShipGraphic(this.shipGraphics);
        this.ship.add(this.shipGraphics);
    }

    private drawShipGraphic(g: Phaser.GameObjects.Graphics) {
        g.clear();
        const s = SHIP_SIZE;
        g.lineStyle(2.5, 0x000000, 1); g.fillStyle(0xffffff, 1);
        g.beginPath();
        g.moveTo(s * 1.8, 0); g.lineTo(-s * 0.6, s * 0.9);
        g.lineTo(-s * 1.1, 0); g.lineTo(-s * 0.6, -s * 0.9);
        g.closePath(); g.fillPath(); g.strokePath();
        g.fillStyle(0x000000, 1);
        g.beginPath();
        g.moveTo(s * 1.2, 0); g.lineTo(s * 0.3, s * 0.35); g.lineTo(s * 0.3, -s * 0.35);
        g.closePath(); g.fillPath();
        g.lineStyle(2, 0x000000, 1); g.fillStyle(0xffffff, 1);
        g.beginPath();
        g.moveTo(s * 0.2, -s * 0.7); g.lineTo(-s * 0.5, -s * 1.6);
        g.lineTo(-s * 1.0, -s * 0.5); g.lineTo(-s * 0.5, -s * 0.5);
        g.closePath(); g.fillPath(); g.strokePath();
        g.beginPath();
        g.moveTo(s * 0.2, s * 0.7); g.lineTo(-s * 0.5, s * 1.6);
        g.lineTo(-s * 1.0, s * 0.5); g.lineTo(-s * 0.5, s * 0.5);
        g.closePath(); g.fillPath(); g.strokePath();
        g.fillStyle(0x222222, 1);
        g.fillRect(-s * 1.15, -s * 0.25, s * 0.45, s * 0.5);
        g.lineStyle(1.5, 0x000000, 1);
        g.strokeRect(-s * 1.15, -s * 0.22, s * 0.42, s * 0.44);
    }

    update(_t: number, delta: number) {
        const dt = Math.min(delta, 32) / 16.6;
        this.handleInput(dt);
        this.applyPhysics(dt);
        this.updateThrustGraphic();
        this.updateCamera(dt);
        this.updateUI();
    }

    private updateThrustGraphic() {
        this.thrustGraphics.clear();
        if (this.throttle <= 0) return;
        const s = SHIP_SIZE, size = s * (0.8 + Math.random() * 0.4) * this.throttle;
        this.thrustGraphics.fillStyle(0xffaa00, 0.35);
        this.thrustGraphics.fillPoints([
            new Phaser.Math.Vector2(-s * 1.15, s * 0.22),
            new Phaser.Math.Vector2(-s * 1.15 - size * 2.8, 0),
            new Phaser.Math.Vector2(-s * 1.15, -s * 0.22),
        ], true);
        this.thrustGraphics.fillStyle(0xffffff, 0.65);
        this.thrustGraphics.fillPoints([
            new Phaser.Math.Vector2(-s * 1.15, s * 0.12),
            new Phaser.Math.Vector2(-s * 1.15 - size * 1.3, 0),
            new Phaser.Math.Vector2(-s * 1.15, -s * 0.12),
        ], true);
    }

    private handleInput(dt: number) {
        const mw  = this.cameras.main.getWorldPoint(this.input.x, this.input.y);
        const ta  = Phaser.Math.Angle.Between(this.ship.x, this.ship.y, mw.x, mw.y);
        const spd = this.velocity.length();
        this.ship.rotation = Phaser.Math.Angle.RotateTo(
            this.ship.rotation, ta, Math.max(0.01, 0.15 / (1 + spd / 500)) * dt
        );

        if (this.keyW.isDown)       this.throttle = Math.min(this.throttle + 0.015 * dt, 1);
        else if (this.keyS.isDown)  this.throttle = Math.max(this.throttle - 0.015 * dt, -1);
        else if (Phaser.Input.Keyboard.JustDown(this.keyX)) this.throttle = -0.05;
        else {
            this.throttle = Phaser.Math.Linear(this.throttle, 0, 0.08 * dt);
            if (Math.abs(this.throttle) < 0.001) this.throttle = 0;
        }

        if (Phaser.Input.Keyboard.JustDown(this.keyN)) {
            this.targetIndex   = (this.targetIndex + 1) % this.stations.length;
            this.targetStation = this.stations[this.targetIndex];
            this.commStatus    = 'none';
        }

        const dist = this.targetStation
            ? Phaser.Math.Distance.Between(this.ship.x, this.ship.y, this.targetStation.x, this.targetStation.y)
            : Infinity;

        if (dist < 2000) {
            if (this.commStatus === 'none' && Phaser.Input.Keyboard.JustDown(this.keyC)) {
                this.commStatus = 'calling'; this.commTimer = 100;
            } else if (this.commStatus === 'identifying') {
                if (Phaser.Input.Keyboard.JustDown(this.key1) || Phaser.Input.Keyboard.JustDown(this.key2)) {
                    this.commStatus       = 'scanning';
                    this.commTimer        = 180;
                    const style = STATION_STYLES[this.stationStyleIndices[this.targetIndex]];
                    this.assignedBayIndex = Phaser.Math.Between(0, style.bayCount - 1);
                }
            }
        } else {
            if (this.commStatus !== 'granted') this.commStatus = 'none';
        }

        if (this.canEnterStation && Phaser.Input.Keyboard.JustDown(this.keyE)) {
            const styleIdx = this.stationStyleIndices[this.targetIndex];
            const style    = STATION_STYLES[styleIdx];
            this.scene.start('TransitionScene', {
                direction:    'in',
                nextScene:    'LandingScene',
                stationStyle: styleIdx,
                nextData: {
                    stationName:      style.name,
                    stationStyleIdx:  styleIdx,
                    assignedBayIndex: this.assignedBayIndex,
                    returnX:          this.ship.x,
                    returnY:          this.ship.y,
                    returnVX:         this.velocity.x,
                    returnVY:         this.velocity.y,
                },
            });
        }
    }

    private applyPhysics(dt: number) {
        const spd = this.velocity.length();
        if (this.throttle > 0) {
            let thrust = this.baseAcceleration * (1 + spd / 200);
            if (spd > 900000) thrust *= 0.01 + Math.max(0, 1 - (spd - 900000) / 100000) * 0.99;
            this.velocity.add(new Phaser.Math.Vector2(
                Math.cos(this.ship.rotation), Math.sin(this.ship.rotation)
            ).scale(thrust * this.throttle * dt));
        } else if (this.throttle < 0) {
            const brake = this.baseAcceleration * 15 * Math.abs(this.throttle) * dt;
            if (spd > brake) this.velocity.setLength(spd - brake);
            else { this.velocity.set(0, 0); this.throttle = 0; }
        }
        if (this.velocity.length() > 1000000) this.velocity.setLength(1000000);
        this.velocity.scale(1 - 0.001 * dt);
        this.ship.x += this.velocity.x * dt;
        this.ship.y += this.velocity.y * dt;
    }

    private updateCamera(dt: number) {
        const speed = this.velocity.length();
        this.autoZoomValue = Math.max(1.0 / (1 + speed / 200), 0.004);

        if (this.manualZoom !== null) {
            this.cameras.main.setZoom(
                Phaser.Math.Linear(this.cameras.main.zoom, this.manualZoom, 0.08 * dt)
            );
            const ratio = this.manualZoom / this.autoZoomValue;
            if (ratio > 1 - this.ZOOM_SNAP_MARGIN && ratio < 1 + this.ZOOM_SNAP_MARGIN)
                this.manualZoom = null;
        } else {
            this.cameras.main.setZoom(
                Phaser.Math.Linear(this.cameras.main.zoom, this.autoZoomValue, 0.05 * dt)
            );
        }

        const zoom = this.cameras.main.zoom;
        if (this.manualZoom !== null) {
            this.ship.setScale(1);
        } else {
            this.ship.setScale(Math.max(1, 8 / (SHIP_SIZE * zoom)));
        }

        const cam = this.cameras.main;
        this.stars.forEach(l => {
            l.sprite.setTilePosition(cam.scrollX * l.factor, cam.scrollY * l.factor);
            l.sprite.setSize(this.scale.width, this.scale.height);
        });
        this.uiCamera.setSize(this.scale.width, this.scale.height);
    }

    private updateUI() {
        const speed = Math.round(this.velocity.length());
        const tp    = Math.round(this.throttle * 100);
        this.speedText.setText(
            `SPEED: ${speed}\n` + (tp < 0 ? `[ BRAKE: ${Math.abs(tp)}% ]` : `THROTTLE: ${tp}%`)
        );

        if (this.manualZoom !== null) {
            const pct = (this.manualZoom / this.autoZoomValue * 100).toFixed(0);
            this.zoomModeText.setText(`ZOOM: MANUAL  (${pct}% of auto)`).setAlpha(1);
        } else {
            this.zoomModeText.setText('ZOOM: AUTO').setAlpha(0.5);
        }
        this.zoomModeText.setX(this.scale.width - 30);

        this.moveArrow.clear();
        const iX = this.scale.width - 80, iY = 80, iR = 50;
        this.moveArrow.lineStyle(2, 0x000000, 1);
        this.moveArrow.strokeCircle(iX, iY, iR);
        this.moveArrow.fillStyle(0x000000, 0.1);
        this.moveArrow.fillCircle(iX, iY, iR);
        if (speed > 1) {
            const ma = this.velocity.angle(), as = 15;
            const tx = iX + Math.cos(ma) * iR * 0.8, ty = iY + Math.sin(ma) * iR * 0.8;
            this.moveArrow.lineStyle(3, 0x000000, 1);
            this.moveArrow.strokeTriangle(
                tx, ty,
                iX + Math.cos(ma + 2.5) * as, iY + Math.sin(ma + 2.5) * as,
                iX + Math.cos(ma - 2.5) * as, iY + Math.sin(ma - 2.5) * as
            );
        }

        this.navArrow.clear();
        this.canEnterStation = false;
        this.commText.setText('');

        if (this.targetStation) {
            const dist  = Math.round(Phaser.Math.Distance.Between(
                this.ship.x, this.ship.y, this.targetStation.x, this.targetStation.y
            ));
            const style = STATION_STYLES[this.stationStyleIndices[this.targetIndex]];
            this.distText.setText(`TARGET: ${style.name}\nDISTANCE: ${dist}`);

            const angle   = Phaser.Math.Angle.Between(this.ship.x, this.ship.y, this.targetStation.x, this.targetStation.y);
            const zoom    = this.cameras.main.zoom;
            const MIX           = 0.30;
            const baseScreenR   = 120;
            const worldR        = baseScreenR / zoom;
            const arrowX        = this.ship.x + Math.cos(angle) * worldR;
            const arrowY        = this.ship.y + Math.sin(angle) * worldR;
            const shrunkWA      = 12 / Math.pow(zoom, 1 - MIX);
            const arrowSize     = Math.max(shrunkWA, 5 / zoom);
            const lineW         = Math.max(3 / Math.pow(zoom, 1 - MIX * 0.5), 1.5 / zoom);

            this.navArrow.lineStyle(lineW, 0x000000, 0.88);
            this.navArrow.strokeTriangle(
                arrowX + Math.cos(angle)       * arrowSize * 1.5,
                arrowY + Math.sin(angle)       * arrowSize * 1.5,
                arrowX + Math.cos(angle + 2.5) * arrowSize,
                arrowY + Math.sin(angle + 2.5) * arrowSize,
                arrowX + Math.cos(angle - 2.5) * arrowSize,
                arrowY + Math.sin(angle - 2.5) * arrowSize,
            );

            const fs = Math.max(10, Math.round(14 * Math.pow(zoom, MIX * 0.5)));
            this.pointerDistText.setFontSize(fs);
            const screenX = this.scale.width  / 2 + Math.cos(angle) * baseScreenR;
            const screenY = this.scale.height / 2 + Math.sin(angle) * baseScreenR;
            this.pointerDistText.setPosition(screenX, screenY).setText(`${dist}`);

            if (dist < 2000) {
                if (this.commStatus === 'none') {
                    this.commText.setText('[ COMM LINK AVAILABLE — PRESS C ]');
                } else if (this.commStatus === 'calling') {
                    this.commTimer--;
                    this.commText.setText('TOWER: UNIDENTIFIED CRAFT, STATE YOUR IDENTIFICATION.');
                    if (this.commTimer <= 0) this.commStatus = 'identifying';
                } else if (this.commStatus === 'identifying') {
                    this.commText.setText('SELECT ID:\n[1] MERCHANT-7   [2] EXPLORER-1');
                } else if (this.commStatus === 'scanning') {
                    this.commTimer--;
                    this.commText.setText(`TOWER: COPY THAT. SCANNING VESSEL... ${Math.ceil(this.commTimer / 60)}s`);
                    if (this.commTimer <= 0) this.commStatus = 'granted';
                } else if (this.commStatus === 'granted') {
                    const bn = getBayName(this.assignedBayIndex);
                    this.commText.setText(`TOWER: SCAN COMPLETE. CLEARANCE GRANTED.\nPROCEED TO BAY ${bn}.`);
                    if (dist < 500 && speed < 60) {
                        this.distText.setText(`TARGET: ${style.name}\nDISTANCE: ${dist}\n[ DOCKING AVAILABLE — PRESS E ]`);
                        this.canEnterStation = true;
                    }
                }
            }
        } else {
            this.pointerDistText.setText('');
        }

        this.hintText.setY(this.scale.height - 50);
        this.commText.setX(this.scale.width / 2);
    }
}

function getBayName(index: number): string {
    // Generate bay identifiers like A-01, A-02 … B-01 …
    const letter = String.fromCharCode(65 + Math.floor(index / 10));
    const num    = (index % 10) + 1;
    return `${letter}-${String(num).padStart(2, '0')}`;
}

// ─────────────────────────────────────────────────────────────────────────────
//  LANDING SCENE  — massive carrier-style hangar with corridor approach
// ─────────────────────────────────────────────────────────────────────────────

interface Bay {
    x: number; y: number; width: number; name: string;
    row: number; col: number;  // grid position
    occupied: boolean;
}

interface CorridorGate {
    x: number; open: boolean;
}

class LandingScene extends Phaser.Scene {
    // Ship
    private ship!: Phaser.GameObjects.Container;
    private thrustGraphics!: Phaser.GameObjects.Graphics;
    private velocity = new Phaser.Math.Vector2(0, 0);
    private blinkTimer = 0;

    // Keys
    private keyW!: Phaser.Input.Keyboard.Key;
    private keyA!: Phaser.Input.Keyboard.Key;
    private keyD!: Phaser.Input.Keyboard.Key;
    private keyEsc!: Phaser.Input.Keyboard.Key;

    // UI
    private statusText!: Phaser.GameObjects.Text;
    private atcText!: Phaser.GameObjects.Text;

    // Physics
    private readonly gravity             = 0.18;
    private readonly thrustPower         = 0.45;
    private readonly WALL_CRASH_SPEED    = 4.5;
    private readonly FLOOR_CRASH_SPEED_V = 3.0;
    private readonly FLOOR_CRASH_SPEED_H = 2.5;

    // State
    private landingStatus: 'approaching' | 'flying' | 'landed' | 'crashed' | 'fined' | 'killed' = 'approaching';
    private readonly PLAYER_HALF_W = 14;
    private readonly PLAYER_TOP    = -10;
    private readonly PLAYER_BOTTOM = 10;

    // Layout
    private bayCount         = 30;
    private assignedBayIndex = 0;
    private bays: Bay[]      = [];
    private stationStyle!: StationStyle;

    // Corridor
    private corridorX      = 0;       // left edge of hangar (entry from left)
    private corridorY      = 0;       // vertical centre of corridor
    private corridorHeight = 80;      // narrow passage height
    private corridorWidth  = 260;     // horizontal length of corridor section
    private gateX          = 0;       // x position of the gate within corridor
    private gateOpen       = false;
    private hadPermission  = false;
    private gateKillZone   = false;   // true when laser is active

    // Hangar bounds
    private hangarLeft   = 0;
    private hangarRight  = 0;
    private hangarTop    = 0;
    private hangarBottom = 0;

    // Return data
    private returnX  = 0; private returnY  = 0;
    private returnVX = 0; private returnVY = 0;
    private stationStyleIdx = 0;

    // NPC blink timers
    private npcBlinkStates: boolean[] = [];
    private npcBlinkTimers: number[]  = [];
    private npcGraphics!: Phaser.GameObjects.Graphics;
    private sceneTime = 0;

    // Camera scroll
    private camTarget = { x: 0, y: 0 };

    constructor() { super({ key: 'LandingScene' }); }

    create(data: {
        stationName?: string; stationStyleIdx?: number; assignedBayIndex?: number;
        returnX?: number; returnY?: number; returnVX?: number; returnVY?: number;
    }) {
        this.cameras.main.setBackgroundColor('#ffffff');
        this.sceneTime       = 0;
        this.landingStatus   = 'approaching';
        this.gateOpen        = false;
        this.gateKillZone    = false;
        this.stationStyleIdx = data?.stationStyleIdx ?? 0;
        this.stationStyle    = STATION_STYLES[this.stationStyleIdx % STATION_STYLES.length];
        this.bayCount        = this.stationStyle.bayCount;
        this.assignedBayIndex = Math.min(data?.assignedBayIndex ?? 0, this.bayCount - 1);
        this.hadPermission   = data?.assignedBayIndex !== undefined;
        this.returnX         = data?.returnX  ?? 0;
        this.returnY         = data?.returnY  ?? 0;
        this.returnVX        = data?.returnVX ?? 0;
        this.returnVY        = data?.returnVY ?? 0;

        this.velocity.set(1.5 + Math.random() * 0.5, 0.2);

        this.buildLayout();
        this.drawScene();
        this.drawNPCShips();
        this.createShip();
        this.setupUI();
        this.setupKeys();

        // Fade in
        this.cameras.main.fadeIn(400, 255, 255, 255);
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  LAYOUT
    // ─────────────────────────────────────────────────────────────────────────
    private buildLayout() {
        const W = this.scale.width, H = this.scale.height;

        // The hangar takes up most of the scene — massive carrier deck
        // Bays arranged in a 2-row grid  (top row + bottom row)
        const cols      = Math.ceil(this.bayCount / 2);
        const bayW      = 58, bayH = 55, padX = 12, padY = 18;
        const totalW    = cols * (bayW + padX) + padX + 60;
        const totalH    = 2   * (bayH + padY)  + padY + 40;

        // Corridor enters from the left
        this.corridorHeight = 72;
        this.corridorWidth  = 280;

        this.hangarLeft   = this.corridorWidth + 20;
        this.hangarTop    = (H - totalH) / 2 - 20;
        this.hangarRight  = this.hangarLeft + totalW;
        this.hangarBottom = this.hangarTop + totalH + 20;

        // Ensure visible
        this.hangarRight  = Math.max(this.hangarRight, W * 2.8);
        this.hangarBottom = Math.min(this.hangarBottom, H - 40);
        this.hangarTop    = Math.max(this.hangarTop, 40);

        this.corridorY = (this.hangarTop + this.hangarBottom) / 2;
        this.corridorX = this.hangarLeft;
        this.gateX     = this.corridorWidth * 0.62;

        // Build bays
        this.bays = [];
        const startX = this.hangarLeft + 50;
        const row0Y  = this.hangarTop    + padY + bayH / 2 + 30;
        const row1Y  = this.hangarBottom - padY - bayH / 2 - 30;

        for (let i = 0; i < this.bayCount; i++) {
            const row = i < Math.ceil(this.bayCount / 2) ? 0 : 1;
            const col = row === 0 ? i : i - Math.ceil(this.bayCount / 2);
            const bx  = startX + col * (bayW + padX) + bayW / 2;
            const by  = row === 0 ? row0Y : row1Y;
            const occ = Math.random() < this.stationStyle.busyness && i !== this.assignedBayIndex;
            this.bays.push({
                x: bx, y: by, width: bayW, name: getBayName(i),
                row, col, occupied: occ,
            });
        }

        // NPC blink states
        this.npcBlinkStates = this.bays.map(b => b.occupied && Math.random() < 0.5);
        this.npcBlinkTimers = this.bays.map(() => Math.random() * 120);
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  DRAW
    // ─────────────────────────────────────────────────────────────────────────
    private drawScene() {
        const W = this.scale.width, H = this.scale.height;
        const g  = this.add.graphics();
        const st = this.stationStyle;

        // Background  
        g.fillStyle(0xf4f4f4, 1); g.fillRect(0, 0, W, H);

        // Architecture pattern behind hangar
        this.drawFloorPattern(g);

        // Corridor tube (left approach)
        const cy  = this.corridorY;
        const cht = this.corridorHeight / 2;
        const cW  = this.corridorX;   // corridor runs 0 → corridorX

        g.fillStyle(0xe8e8e8, 1);
        g.fillRect(0, cy - cht - 6, cW, this.corridorHeight + 12);
        g.lineStyle(3, 0x000000, 1);
        g.strokeRect(0, cy - cht - 6, cW, this.corridorHeight + 12);

        // Corridor walls (inner)
        g.lineStyle(2, 0x000000, 0.7);
        g.strokeLineShape(new Phaser.Geom.Line(0, cy - cht, cW, cy - cht));
        g.strokeLineShape(new Phaser.Geom.Line(0, cy + cht, cW, cy + cht));

        // Corridor distance markers
        g.lineStyle(1, 0x000000, 0.25);
        for (let mx = 30; mx < cW - 20; mx += 40) {
            g.strokeLineShape(new Phaser.Geom.Line(mx, cy - cht, mx, cy - cht + 8));
            g.strokeLineShape(new Phaser.Geom.Line(mx, cy + cht, mx, cy + cht - 8));
        }

        // ENTRY arrow indicators
        g.lineStyle(1.5, 0x000000, 0.4);
        for (let ax = 15; ax < cW - 30; ax += 55) {
            const arY = cy;
            g.strokeTriangle(ax + 12, arY, ax, arY - 8, ax, arY + 8);
        }

        // Gate frame (drawn dynamically in update, but draw static frame here)
        g.lineStyle(3, 0x000000, 1);
        const gx = this.gateX;
        g.strokeLineShape(new Phaser.Geom.Line(gx, cy - cht - 6, gx, cy - cht - 22));
        g.strokeLineShape(new Phaser.Geom.Line(gx, cy + cht + 6, gx, cy + cht + 22));

        // Gate label
        this.add.text(gx, cy - cht - 30, 'ATC GATE', {
            color: '#000', fontSize: '11px', fontStyle: 'bold',
        }).setOrigin(0.5, 1);

        // Hangar hull
        g.fillStyle(0xeeeeee, 1);
        g.fillRect(this.hangarLeft, this.hangarTop, this.hangarRight - this.hangarLeft, this.hangarBottom - this.hangarTop);
        g.lineStyle(4, 0x000000, 1);
        g.strokeRect(this.hangarLeft, this.hangarTop, this.hangarRight - this.hangarLeft, this.hangarBottom - this.hangarTop);

        // Hangar ceiling lights (per architecture)
        this.drawCeilingLights(g);

        // Bay slots
        this.drawBaySlots(g);

        // Structural pillars
        const pillarSpacing = 160;
        g.lineStyle(3, 0x000000, 0.35);
        for (let px = this.hangarLeft + pillarSpacing; px < this.hangarRight - 10; px += pillarSpacing) {
            g.strokeLineShape(new Phaser.Geom.Line(px, this.hangarTop, px, this.hangarTop + 22));
            g.strokeLineShape(new Phaser.Geom.Line(px, this.hangarBottom - 22, px, this.hangarBottom));
        }

        // Station name watermark
        this.add.text(
            (this.hangarLeft + this.hangarRight) / 2,
            (this.hangarTop + this.hangarBottom) / 2,
            this.stationStyle.name,
            { color: '#000', fontSize: '36px', fontStyle: 'bold' }
        ).setOrigin(0.5).setAlpha(0.04);
    }

    private drawFloorPattern(g: Phaser.GameObjects.Graphics) {
        const W = this.scale.width, H = this.scale.height;
        const pat = this.stationStyle.floorPattern;
        g.lineStyle(1, 0x000000, 0.07);
        switch (pat) {
            case 'grid':
                for (let x = 0; x < W; x += 40) g.strokeLineShape(new Phaser.Geom.Line(x, 0, x, H));
                for (let y = 0; y < H; y += 40) g.strokeLineShape(new Phaser.Geom.Line(0, y, W, y));
                break;
            case 'stripe':
                for (let x = -H; x < W + H; x += 30)
                    g.strokeLineShape(new Phaser.Geom.Line(x, 0, x + H, H));
                break;
            case 'chevron':
                for (let y = 0; y < H + 40; y += 40)
                    for (let x = 0; x < W; x += 60) {
                        g.strokeLineShape(new Phaser.Geom.Line(x, y, x + 30, y - 20));
                        g.strokeLineShape(new Phaser.Geom.Line(x + 30, y - 20, x + 60, y));
                    }
                break;
            case 'dot':
                g.fillStyle(0x000000, 0.07);
                for (let x = 20; x < W; x += 35)
                    for (let y = 20; y < H; y += 35)
                        g.fillCircle(x, y, 2);
                break;
            case 'hex':
                g.lineStyle(1, 0x000000, 0.06);
                for (let row = 0; row < H / 30 + 2; row++)
                    for (let col = 0; col < W / 35 + 2; col++) {
                        const hx = col * 35 + (row % 2) * 17.5, hy = row * 30;
                        const r  = 18;
                        for (let v = 0; v < 6; v++) {
                            const a1 = (v / 6) * Math.PI * 2, a2 = ((v + 1) / 6) * Math.PI * 2;
                            g.strokeLineShape(new Phaser.Geom.Line(
                                hx + Math.cos(a1) * r, hy + Math.sin(a1) * r,
                                hx + Math.cos(a2) * r, hy + Math.sin(a2) * r
                            ));
                        }
                    }
                break;
        }
    }

    private drawCeilingLights(g: Phaser.GameObjects.Graphics) {
        const arch  = this.stationStyle.architecture;
        const top   = this.hangarTop;
        const lStep = arch === 'military' ? 48 : arch === 'brutalist' ? 64 : 52;
        for (let lx = this.hangarLeft + 30; lx < this.hangarRight - 10; lx += lStep) {
            g.fillStyle(0x000000, 0.85);
            if (arch === 'sleek')      { g.fillRect(lx - 14, top, 28, 5); }
            else if (arch === 'brutalist') { g.fillRect(lx - 8, top, 16, 9); }
            else if (arch === 'industrial') {
                g.fillRect(lx - 10, top, 20, 5);
                g.lineStyle(1, 0x000000, 0.5);
                g.strokeLineShape(new Phaser.Geom.Line(lx, top + 5, lx, top + 18));
            }
            else { g.fillCircle(lx, top + 4, 5); }
            g.fillStyle(0x000000, 0.06);
            g.fillTriangle(lx - 16, top + 5, lx + 16, top + 5, lx, top + 34);
        }
    }

    private drawBaySlots(g: Phaser.GameObjects.Graphics) {
        for (let i = 0; i < this.bays.length; i++) {
            const b      = this.bays[i];
            const isAsgn = i === this.assignedBayIndex;
            const hw     = b.width / 2;
            const floorDir = b.row === 0 ? 1 : -1;   // row 0 = ceiling bays, row 1 = floor bays
            const bayFloor = b.row === 0 ? b.y + 28 : b.y - 28;
            const bayCeil  = b.row === 0 ? b.y - 28 : b.y + 28;

            // Bay recess
            g.fillStyle(0xdedede, 1);
            g.fillRect(b.x - hw, Math.min(bayFloor, bayCeil), b.width, 56);

            // Bay border
            g.lineStyle(isAsgn ? 4 : 2, 0x000000, isAsgn ? 1 : 0.4);
            g.strokeRect(b.x - hw, Math.min(bayFloor, bayCeil), b.width, 56);

            // Approach lights strip
            for (let d = 0; d < 4; d++) {
                g.fillStyle(0x000000, isAsgn ? 0.9 : 0.2);
                g.fillCircle(b.x - hw + 8 + d * 13, bayFloor + floorDir * (-4), 2.5);
            }

            // Bay label
            this.add.text(b.x, bayFloor + floorDir * (-16), b.name, {
                color: isAsgn ? '#000' : '#888',
                fontSize: isAsgn ? '10px' : '8px',
                fontStyle: isAsgn ? 'bold' : 'normal',
            }).setOrigin(0.5);

            // Assignment arrow
            if (isAsgn) {
                g.fillStyle(0x000000, 0.9);
                const arrowDir = b.row === 0 ? -1 : 1;
                g.fillTriangle(
                    b.x, bayFloor + arrowDir * 12,
                    b.x - 8, bayFloor + arrowDir * 26,
                    b.x + 8, bayFloor + arrowDir * 26
                );
                // Dashed guide line from corridor to assigned bay
                g.lineStyle(1.5, 0x000000, 0.22);
                for (let dl = this.hangarLeft + 10; dl < b.x - hw; dl += 18)
                    g.strokeLineShape(new Phaser.Geom.Line(dl, b.y, Math.min(dl + 12, b.x - hw), b.y));
            }
        }
    }

    private drawNPCShips() {
        this.npcGraphics = this.add.graphics();
        this.redrawNPCShips();
    }

    private redrawNPCShips() {
        const g = this.npcGraphics;
        g.clear();
        for (let i = 0; i < this.bays.length; i++) {
            if (!this.bays[i].occupied) continue;
            const b     = this.bays[i];
            const blink = this.npcBlinkStates[i];

            // Vary ship sizes — some massive capital ships, some freighters, tiny fighters
            const hash    = (i * 2654435761) >>> 0;
            const sizeType: 'capital' | 'heavy' | 'medium' | 'fighter' =
                hash % 10 < 1 ? 'capital' :
                hash % 10 < 3 ? 'heavy'   :
                hash % 10 < 7 ? 'medium'  : 'fighter';

            const scale = sizeType === 'capital' ? 3.5 :
                          sizeType === 'heavy'   ? 2.2 :
                          sizeType === 'medium'  ? 1.4 : 0.7;

            const floorDir = b.row === 0 ? 1 : -1;
            const landedY  = b.y + floorDir * 0;
            this.drawNPCShipAt(g, b.x, landedY, scale, hash, blink);
        }
    }

    private drawNPCShipAt(
        g: Phaser.GameObjects.Graphics, cx: number, cy: number,
        scale: number, hash: number, blink: boolean
    ) {
        const s = 12 * scale;
        // Each NPC ship has a slightly different silhouette based on hash
        const variant = hash % 4;

        g.lineStyle(1.5 / scale, 0x000000, 1);
        g.fillStyle(0xffffff, 1);

        if (variant === 0) {
            // Classic delta wing
            g.beginPath();
            g.moveTo(cx + s * 1.8, cy);
            g.lineTo(cx - s * 0.8, cy + s * 1.1);
            g.lineTo(cx - s * 1.2, cy);
            g.lineTo(cx - s * 0.8, cy - s * 1.1);
            g.closePath(); g.fillPath(); g.strokePath();
        } else if (variant === 1) {
            // Boxy freighter
            g.fillRect(cx - s * 1.2, cy - s * 0.7, s * 2.4, s * 1.4);
            g.strokeRect(cx - s * 1.2, cy - s * 0.7, s * 2.4, s * 1.4);
            g.fillStyle(0x222222, 1);
            g.fillRect(cx + s * 0.5, cy - s * 0.3, s * 0.55, s * 0.6);
        } else if (variant === 2) {
            // Swept wing fighter
            g.beginPath();
            g.moveTo(cx + s * 2.0, cy);
            g.lineTo(cx - s * 0.4, cy + s * 0.8);
            g.lineTo(cx - s * 0.9, cy + s * 1.5);
            g.lineTo(cx - s * 1.0, cy);
            g.lineTo(cx - s * 0.9, cy - s * 1.5);
            g.lineTo(cx - s * 0.4, cy - s * 0.8);
            g.closePath(); g.fillPath(); g.strokePath();
        } else {
            // Capital ship — elongated carrier
            g.fillEllipse(cx, cy, s * 3.6, s * 0.9);
            g.strokeEllipse(cx, cy, s * 3.6, s * 0.9);
            g.fillStyle(0x111111, 1);
            g.fillRect(cx + s * 0.8, cy - s * 0.22, s * 0.6, s * 0.44);
            // Mini wing fins
            g.fillStyle(0xffffff, 1);
            g.lineStyle(1, 0x000000, 0.8);
            g.fillTriangle(cx - s * 0.6, cy, cx - s * 1.2, cy + s * 0.8, cx + s * 0.2, cy);
            g.strokeTriangle(cx - s * 0.6, cy, cx - s * 1.2, cy + s * 0.8, cx + s * 0.2, cy);
            g.fillTriangle(cx - s * 0.6, cy, cx - s * 1.2, cy - s * 0.8, cx + s * 0.2, cy);
            g.strokeTriangle(cx - s * 0.6, cy, cx - s * 1.2, cy - s * 0.8, cx + s * 0.2, cy);
        }

        // Nav blink lights
        if (blink) {
            g.fillStyle(0x000000, 0.9);
            g.fillCircle(cx + s * 1.2, cy, 2.5);
            g.fillCircle(cx - s * 1.0, cy + s * 0.6, 2);
            g.fillCircle(cx - s * 1.0, cy - s * 0.6, 2);
        }
    }

    // Gate graphics — drawn each frame
    private gateGraphics!: Phaser.GameObjects.Graphics;

    private createShip() {
        const entryY = this.corridorY;
        this.ship    = this.add.container(-40, entryY);   // starts off-screen left
        const sg     = this.add.graphics();
        this.drawPlayerShip(sg);
        this.ship.add(sg);
        this.thrustGraphics = this.add.graphics();
        this.ship.add(this.thrustGraphics);

        this.gateGraphics = this.add.graphics();
    }

    private drawPlayerShip(g: Phaser.GameObjects.Graphics) {
        const s = 12;  // player ship is notably smaller than NPCs
        g.lineStyle(2, 0x000000, 1); g.fillStyle(0xffffff, 1);
        g.beginPath();
        g.moveTo(s * 1.8, 0); g.lineTo(-s * 0.6, s * 0.9);
        g.lineTo(-s * 1.1, 0); g.lineTo(-s * 0.6, -s * 0.9);
        g.closePath(); g.fillPath(); g.strokePath();
        g.fillStyle(0x000000, 1);
        g.beginPath();
        g.moveTo(s * 1.2, 0); g.lineTo(s * 0.3, s * 0.35); g.lineTo(s * 0.3, -s * 0.35);
        g.closePath(); g.fillPath();
        // Wings
        g.lineStyle(1.5, 0x000000, 1); g.fillStyle(0xffffff, 1);
        g.beginPath();
        g.moveTo(s * 0.2, -s * 0.7); g.lineTo(-s * 0.5, -s * 1.5);
        g.lineTo(-s * 0.9, -s * 0.5); g.lineTo(-s * 0.4, -s * 0.5);
        g.closePath(); g.fillPath(); g.strokePath();
        g.beginPath();
        g.moveTo(s * 0.2, s * 0.7); g.lineTo(-s * 0.5, s * 1.5);
        g.lineTo(-s * 0.9, s * 0.5); g.lineTo(-s * 0.4, s * 0.5);
        g.closePath(); g.fillPath(); g.strokePath();
        g.fillStyle(0x222222, 1);
        g.fillRect(-s * 1.1, -s * 0.22, s * 0.42, s * 0.44);
    }

    private setupUI() {
        this.statusText = this.add.text(30, 30, '', {
            color: '#000', fontSize: '20px', fontStyle: 'bold',
        }).setDepth(20);

        const bn = getBayName(this.assignedBayIndex);
        this.atcText = this.add.text(this.scale.width / 2, 30,
            this.hadPermission
                ? `ATC: PROCEED TO BAY ${bn} — GATE OPEN`
                : `ATC: NO CLEARANCE — LASER GRID ACTIVE`,
            {
                color: '#000', fontSize: '18px', fontStyle: 'bold', align: 'center',
                backgroundColor: '#fff', padding: { x: 10, y: 5 },
            }
        ).setOrigin(0.5, 0).setDepth(20);

        this.add.text(30, this.scale.height - 50,
            'W: THRUST UP  |  A/D: LATERAL  |  ESC: ABORT / RETRY / DEPART',
            { color: '#000', fontSize: '15px' }
        ).setDepth(20);
    }

    private setupKeys() {
        if (this.input.keyboard) {
            this.keyW   = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W);
            this.keyA   = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
            this.keyD   = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);
            this.keyEsc = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  UPDATE
    // ─────────────────────────────────────────────────────────────────────────
    update(_t: number, delta: number) {
        this.sceneTime += delta;

        if (Phaser.Input.Keyboard.JustDown(this.keyEsc)) { this.leaveScene(); return; }

        // NPC blink update
        this.blinkTimer++;
        for (let i = 0; i < this.bays.length; i++) {
            if (!this.bays[i].occupied) continue;
            this.npcBlinkTimers[i] -= 1;
            if (this.npcBlinkTimers[i] <= 0) {
                this.npcBlinkStates[i] = !this.npcBlinkStates[i];
                this.npcBlinkTimers[i] = 30 + Math.random() * 90;
            }
        }
        if (this.blinkTimer % 3 === 0) this.redrawNPCShips();

        this.drawGate();

        if (this.landingStatus === 'approaching') {
            // Ship slides in from left during approach phase
            this.ship.x += 2.2;
            if (this.ship.x >= 60) this.landingStatus = 'flying';
            return;
        }

        if (this.landingStatus !== 'flying') return;

        const dt = Math.min(delta, 32) / 16.6;
        this.velocity.y += this.gravity * dt;
        this.thrustGraphics.clear();

        if (this.keyW.isDown) { this.velocity.y -= this.thrustPower * dt;       this.drawThrust(0, 12); }
        if (this.keyA.isDown) { this.velocity.x -= this.thrustPower * 0.55 * dt; this.drawSideThrust(22, 0); }
        if (this.keyD.isDown) { this.velocity.x += this.thrustPower * 0.55 * dt; this.drawSideThrust(-22, 0); }
        this.velocity.x = Phaser.Math.Clamp(this.velocity.x, -10, 10);
        this.velocity.y = Phaser.Math.Clamp(this.velocity.y, -14, 14);

        this.ship.x += this.velocity.x * dt;
        this.ship.y += this.velocity.y * dt;

        this.statusText.setText(
            `V: ${Math.abs(this.velocity.y).toFixed(1)}  H: ${Math.abs(this.velocity.x).toFixed(1)}`
        );

        this.checkCollisions();
        this.clampToScene();
    }

    private drawGate() {
        const g   = this.gateGraphics;
        const gx  = this.gateX;
        const cy  = this.corridorY;
        const cht = this.corridorHeight / 2;
        g.clear();

        if (this.hadPermission) {
            // Open gate — just green indicator lights
            g.fillStyle(0x000000, 0.8);
            g.fillCircle(gx, cy - cht - 8, 4);
            g.fillCircle(gx, cy + cht + 8, 4);
        } else {
            // Laser grid — animated red beams
            const pulse = 0.5 + 0.5 * Math.sin(this.sceneTime * 0.01);
            g.lineStyle(2, 0x000000, 0.85 * pulse);
            const steps = 6;
            for (let s = 0; s <= steps; s++) {
                const lx = gx - 4 + (s / steps) * 8;
                g.strokeLineShape(new Phaser.Geom.Line(lx, cy - cht, lx, cy + cht));
            }
            // Gate housing
            g.lineStyle(3, 0x000000, 1);
            g.fillStyle(0x111111, 1);
            g.fillRect(gx - 6, cy - cht - 16, 12, 16);
            g.fillRect(gx - 6, cy + cht,       12, 16);
            g.strokeRect(gx - 6, cy - cht - 16, 12, 16);
            g.strokeRect(gx - 6, cy + cht,       12, 16);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  COLLISION
    // ─────────────────────────────────────────────────────────────────────────
    private checkCollisions() {
        const cy  = this.corridorY;
        const cht = this.corridorHeight / 2;
        const sx  = this.ship.x;
        const sy  = this.ship.y;
        const st  = sy + this.PLAYER_TOP;
        const sb  = sy + this.PLAYER_BOTTOM;
        const sl  = sx - this.PLAYER_HALF_W;
        const sr  = sx + this.PLAYER_HALF_W;

        // ── Corridor phase (ship still in corridor, before hangar) ──
        if (sx < this.corridorX) {
            // Corridor walls
            if (st <= cy - cht) {
                this.ship.y = cy - cht - this.PLAYER_TOP + 1;
                if (Math.abs(this.velocity.y) > this.WALL_CRASH_SPEED) { this.onCrash(); return; }
                this.velocity.y = Math.abs(this.velocity.y) * 0.35;
            }
            if (sb >= cy + cht) {
                this.ship.y = cy + cht - this.PLAYER_BOTTOM - 1;
                if (Math.abs(this.velocity.y) > this.WALL_CRASH_SPEED) { this.onCrash(); return; }
                this.velocity.y = -Math.abs(this.velocity.y) * 0.35;
            }

            // Gate kill zone (laser grid)
            if (!this.hadPermission && sx >= this.gateX - 6 && sx <= this.gateX + 6) {
                this.onKilled(); return;
            }
        }

        // ── Hangar phase ──
        if (sx >= this.hangarLeft) {
            // Ceiling
            if (st <= this.hangarTop + 6) {
                this.ship.y = this.hangarTop + 6 - this.PLAYER_TOP + 1;
                if (Math.abs(this.velocity.y) > this.WALL_CRASH_SPEED) { this.onCrash(); return; }
                this.velocity.y = Math.abs(this.velocity.y) * 0.35;
            }
            // Floor
            if (sb >= this.hangarBottom - 6) {
                this.ship.y = this.hangarBottom - 6 - this.PLAYER_BOTTOM - 1;
                if (Math.abs(this.velocity.y) > this.WALL_CRASH_SPEED) { this.onCrash(); return; }
                this.velocity.y = -Math.abs(this.velocity.y) * 0.35;
            }
            // Side walls
            if (sl <= this.hangarLeft + 4) {
                this.ship.x = this.hangarLeft + 4 + this.PLAYER_HALF_W + 1;
                if (Math.abs(this.velocity.x) > this.WALL_CRASH_SPEED) { this.onCrash(); return; }
                this.velocity.x = Math.abs(this.velocity.x) * 0.4;
            }
            if (sr >= this.hangarRight - 4) {
                this.ship.x = this.hangarRight - 4 - this.PLAYER_HALF_W - 1;
                if (Math.abs(this.velocity.x) > this.WALL_CRASH_SPEED) { this.onCrash(); return; }
                this.velocity.x = -Math.abs(this.velocity.x) * 0.4;
            }

            // Bay landing check
            for (let i = 0; i < this.bays.length; i++) {
                const b    = this.bays[i];
                const hw   = b.width / 2;
                const bayFloorY = b.row === 0 ? b.y + 28 : b.y - 28;
                const inBayX    = sx >= b.x - hw && sx <= b.x + hw;

                // Row 0 = top bays (land from below, ship bottom hits bay floor)
                // Row 1 = bottom bays (land from above)
                const hitBay = b.row === 0
                    ? (sb >= bayFloorY - 2 && sb <= bayFloorY + 8 && inBayX)
                    : (st <= bayFloorY + 2 && st >= bayFloorY - 8 && inBayX);

                if (hitBay) {
                    if (Math.abs(this.velocity.y) > this.FLOOR_CRASH_SPEED_V ||
                        Math.abs(this.velocity.x) > this.FLOOR_CRASH_SPEED_H) {
                        this.onCrash(); return;
                    }
                    // Snap to bay
                    this.velocity.set(0, 0);
                    this.ship.y = b.row === 0
                        ? bayFloorY - this.PLAYER_BOTTOM
                        : bayFloorY - this.PLAYER_TOP;

                    if (i === this.assignedBayIndex) this.onLandedCorrect();
                    else                             this.onLandedWrongBay(i);
                    return;
                }
            }
        }
    }

    private clampToScene() {
        const W = this.scale.width;
        // Allow going off the right if hangar is wide, but not off top/bottom
        if (this.ship.x < -50) this.ship.x = -50;
        if (this.ship.y < 10) {
            this.ship.y = 10;
            this.velocity.y = Math.max(this.velocity.y, 0.1);
        }
        if (this.ship.y > this.scale.height - 10) {
            this.ship.y = this.scale.height - 10;
            this.velocity.y = Math.min(this.velocity.y, -0.1);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  OUTCOMES
    // ─────────────────────────────────────────────────────────────────────────
    private onKilled() {
        if (this.landingStatus !== 'flying') return;
        this.landingStatus = 'killed';
        this.ship.setAlpha(0);
        this.cameras.main.flash(300, 0, 0, 0);
        this.cameras.main.shake(400, 0.018);
        // Draw explosion
        const ex = this.add.graphics();
        for (let i = 0; i < 12; i++) {
            const angle = (i / 12) * Math.PI * 2;
            ex.lineStyle(2, 0x000000, 0.8);
            ex.strokeLineShape(new Phaser.Geom.Line(
                this.ship.x, this.ship.y,
                this.ship.x + Math.cos(angle) * (20 + Math.random() * 30),
                this.ship.y + Math.sin(angle) * (20 + Math.random() * 30)
            ));
        }
        this.tweens.add({ targets: ex, alpha: 0, duration: 800, onComplete: () => ex.destroy() });
        this.statusText.setText('DESTROYED BY LASER GRID!\nNO CLEARANCE DETECTED.\nPRESS ESC TO RETRY');
    }

    private onCrash() {
        if (this.landingStatus !== 'flying') return;
        this.landingStatus = 'crashed';
        this.statusText.setText('CRASHED!\nPRESS ESC TO RETRY');
        this.ship.setAlpha(0.25);
        this.cameras.main.shake(300, 0.012);
    }

    private onLandedCorrect() {
        this.landingStatus = 'landed';
        this.statusText.setText(`LANDED IN BAY ${getBayName(this.assignedBayIndex)}\nSUCCESSFUL DOCKING!\nPRESS ESC TO DEPART`);
    }

    private onLandedWrongBay(bayIndex: number) {
        this.landingStatus = 'fined';
        this.statusText.setText(
            `WRONG BAY — ${getBayName(bayIndex)}!\n` +
            `ASSIGNED: ${getBayName(this.assignedBayIndex)}\n` +
            `FINE: 500 CREDITS DEDUCTED.\nPRESS ESC TO DEPART`
        );
        this.tweens.add({ targets: this.ship, alpha: { from: 1, to: 0.3 }, duration: 80, yoyo: true, repeat: 6 });
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  THRUST FX
    // ─────────────────────────────────────────────────────────────────────────
    private drawThrust(x: number, y: number) {
        const sz = 12 + Math.random() * 9;
        this.thrustGraphics.fillStyle(0xffaa00, 0.4);
        this.thrustGraphics.fillPoints([
            new Phaser.Math.Vector2(x - 5, y),
            new Phaser.Math.Vector2(x, y + sz),
            new Phaser.Math.Vector2(x + 5, y),
        ], true);
        this.thrustGraphics.fillStyle(0xffffff, 0.65);
        this.thrustGraphics.fillPoints([
            new Phaser.Math.Vector2(x - 2.5, y),
            new Phaser.Math.Vector2(x, y + sz * 0.55),
            new Phaser.Math.Vector2(x + 2.5, y),
        ], true);
    }

    private drawSideThrust(x: number, _y: number) {
        const sz = 9 + Math.random() * 5, dir = x > 0 ? 1 : -1;
        this.thrustGraphics.fillStyle(0xffaa00, 0.35);
        this.thrustGraphics.fillPoints([
            new Phaser.Math.Vector2(x, -3),
            new Phaser.Math.Vector2(x + dir * sz, 0),
            new Phaser.Math.Vector2(x, 3),
        ], true);
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  LEAVE
    // ─────────────────────────────────────────────────────────────────────────
    private leaveScene() {
        if (this.landingStatus === 'crashed' || this.landingStatus === 'killed') {
            this.cameras.main.fadeOut(300, 255, 255, 255);
            this.time.delayedCall(320, () => {
                this.scene.restart({
                    stationStyleIdx:  this.stationStyleIdx,
                    assignedBayIndex: this.assignedBayIndex,
                    returnX: this.returnX, returnY: this.returnY,
                    returnVX: this.returnVX, returnVY: this.returnVY,
                });
            });
        } else {
            // Smooth transition back to space
            this.scene.start('TransitionScene', {
                direction:    'out',
                nextScene:    'GameScene',
                stationStyle: this.stationStyleIdx,
                nextData: {
                    returnX: this.returnX, returnY: this.returnY,
                    returnVX: this.returnVX, returnVY: this.returnVY,
                },
            });
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  BOOT
// ─────────────────────────────────────────────────────────────────────────────
const config: Phaser.Types.Core.GameConfig = {
    type:    Phaser.AUTO,
    width:   window.innerWidth,
    height:  window.innerHeight,
    parent:  'game-container',
    scene:   [GameScene, LandingScene, TransitionScene],
    physics: { default: 'arcade', arcade: { debug: false } },
};
// @ts-ignore
window.game = new Phaser.Game(config);
window.addEventListener('resize', () => {
    // @ts-ignore
    if (window.game) window.game.scale.resize(window.innerWidth, window.innerHeight);
});