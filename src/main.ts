import Phaser from 'phaser';

const WORLD_SIZE   = 10000000;
const SHIP_SIZE    = 20;
const STATION_SIZE = 150;

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

    // ── Stars ──────────────────────────────────────────────────────────────
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

    // ── Stations ───────────────────────────────────────────────────────────
    private createStations(count: number) {
        for (let i = 0; i < count; i++) {
            const angle   = Math.random() * Math.PI * 2;
            const dist    = 50000 + Math.random() * (WORLD_SIZE / 3);
            const station = this.add.container(Math.cos(angle) * dist, Math.sin(angle) * dist);
            const g       = this.add.graphics();
            g.lineStyle(4, 0x000000);
            const pts: Phaser.Math.Vector2[] = [];
            for (let s = 0; s < 8; s++) {
                const a = (s / 8) * Math.PI * 2;
                pts.push(new Phaser.Math.Vector2(
                    Math.cos(a) * (s % 2 === 0 ? STATION_SIZE : STATION_SIZE * 0.8),
                    Math.sin(a) * (s % 2 === 0 ? STATION_SIZE : STATION_SIZE * 0.8)
                ));
            }
            g.strokePoints(pts, true);
            station.add(g);
            station.add(this.add.text(0, STATION_SIZE + 20, `SECTOR ${i + 1}`, {
                color: '#000', fontSize: '18px', fontStyle: 'bold',
            }).setOrigin(0.5));
            this.stations.push(station);
        }
        this.targetIndex   = 0;
        this.targetStation = this.stations[0];
    }

    // ── Ship ───────────────────────────────────────────────────────────────
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

    // ── Loop ───────────────────────────────────────────────────────────────
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
                    this.assignedBayIndex = Phaser.Math.Between(0, 4);
                }
            }
        } else {
            if (this.commStatus !== 'granted') this.commStatus = 'none';
        }

        if (this.canEnterStation && Phaser.Input.Keyboard.JustDown(this.keyE)) {
            const label = (this.targetStation!.list[1] as Phaser.GameObjects.Text).text;
            this.scene.start('LandingScene', {
                stationName:      label,
                assignedBayIndex: this.assignedBayIndex,
                returnX:          this.ship.x,
                returnY:          this.ship.y,
                returnVX:         this.velocity.x,
                returnVY:         this.velocity.y,
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

        // Manual zoom: ship is a pure world object — camera zoom shrinks/grows it
        // exactly like every other world object. Scale stays 1.
        // Auto zoom: enforce a tiny minimum so ship never disappears at extreme speed.
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

        // Movement instrument
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

        // Nav arrow
        this.navArrow.clear();
        this.canEnterStation = false;
        this.commText.setText('');

        if (this.targetStation) {
            const dist  = Math.round(Phaser.Math.Distance.Between(
                this.ship.x, this.ship.y, this.targetStation.x, this.targetStation.y
            ));
            const label = (this.targetStation.list[1] as Phaser.GameObjects.Text).text;
            this.distText.setText(`TARGET: ${label}\nDISTANCE: ${dist}`);

            const angle   = Phaser.Math.Angle.Between(this.ship.x, this.ship.y, this.targetStation.x, this.targetStation.y);
            const zoom    = this.cameras.main.zoom;
            // Arrow is drawn in world space at fixed screen radius.
            // MIX controls how much the arrow size shrinks with zoom (0=never, 1=fully).
            // We use 0.3 so it visibly shrinks but stays readable.
            const MIX           = 0.30;
            const baseScreenR   = 120;
            const worldR        = baseScreenR / zoom;
            const arrowX        = this.ship.x + Math.cos(angle) * worldR;
            const arrowY        = this.ship.y + Math.sin(angle) * worldR;
            // Arrow world size: at zoom=1 → 12/1=12; at zoom=0.1 → base + mix makes it bigger in world but smaller on screen
            const baseWA        = 12 / zoom;                        // fully zoom-compensated (same screen size always)
            const shrunkWA      = 12 / Math.pow(zoom, 1 - MIX);    // partially zoom-compensated
            const arrowSize     = Math.max(shrunkWA, 5 / zoom);     // floor keeps it visible
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

            // Distance text – shrinks slightly at low zoom, never below 10px
            const fs = Math.max(10, Math.round(14 * Math.pow(zoom, MIX * 0.5)));
            this.pointerDistText.setFontSize(fs);
            const screenX = this.scale.width  / 2 + Math.cos(angle) * baseScreenR;
            const screenY = this.scale.height / 2 + Math.sin(angle) * baseScreenR;
            this.pointerDistText.setPosition(screenX, screenY).setText(`${dist}`);

            // Comms
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
                    const bayNames = ['ALPHA', 'BETA', 'GAMMA', 'DELTA', 'EPSILON'];
                    const bn       = bayNames[this.assignedBayIndex] ?? 'ALPHA';
                    this.commText.setText(`TOWER: SCAN COMPLETE. CLEARANCE GRANTED.\nPROCEED TO LANDING BAY ${bn}.`);
                    if (dist < 500 && speed < 60) {
                        this.distText.setText(`TARGET: ${label}\nDISTANCE: ${dist}\n[ DOCKING AVAILABLE — PRESS E ]`);
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


// ─────────────────────────────────────────────────────────────────────────────
//  LANDING SCENE
// ─────────────────────────────────────────────────────────────────────────────

interface TerrainPoint { x: number; y: number; }
type HangarType = 'bunker' | 'surface' | 'shaft';

interface Bay   { x: number; y: number; width: number; name: string; }
interface Hangar {
    type:       HangarType;
    left:       number;
    right:      number;
    floorY:     number;
    ceilingY:   number;
    entryLeft:  number;
    entryRight: number;
    entryTop:   number;   // for shaft: top of the shaft; for others: same as ceilingY
    bays:       Bay[];
}

class LandingScene extends Phaser.Scene {
    private ship!: Phaser.GameObjects.Container;
    private thrustGraphics!: Phaser.GameObjects.Graphics;
    private velocity = new Phaser.Math.Vector2(0, 0);

    private keyW!: Phaser.Input.Keyboard.Key;
    private keyA!: Phaser.Input.Keyboard.Key;
    private keyD!: Phaser.Input.Keyboard.Key;
    private keyEsc!: Phaser.Input.Keyboard.Key;

    private statusText!: Phaser.GameObjects.Text;

    private readonly gravity                = 0.15;
    private readonly thrustPower            = 0.4;
    private readonly CEILING_BOUNCE_SPEED   = 2.5;
    private readonly CEILING_CRASH_SPEED    = 5.0;

    private landingStatus: 'flying' | 'landed' | 'crashed' | 'fined' = 'flying';

    private hangar!: Hangar;
    private assignedBayIndex = 0;
    private bayCount         = 3;
    private terrainPoints: TerrainPoint[] = [];

    private returnX  = 0; private returnY  = 0;
    private returnVX = 0; private returnVY = 0;
    private stationSeed = 0;

    // Lander collision dims (relative to container origin)
    private readonly SHIP_HALF_W = 26;
    private readonly SHIP_TOP    = -20;
    private readonly SHIP_BOTTOM = 18;

    constructor() { super({ key: 'LandingScene' }); }

    create(data: {
        stationName?: string; assignedBayIndex?: number;
        returnX?: number; returnY?: number; returnVX?: number; returnVY?: number;
    }) {
        this.cameras.main.setBackgroundColor('#ffffff');
        this.landingStatus    = 'flying';
        this.velocity.set((Math.random() - 0.5) * 3, 0.8 + Math.random() * 1.5);
        this.assignedBayIndex = data?.assignedBayIndex ?? 0;
        this.returnX          = data?.returnX  ?? 0;
        this.returnY          = data?.returnY  ?? 0;
        this.returnVX         = data?.returnVX ?? 0;
        this.returnVY         = data?.returnVY ?? 0;
        this.terrainPoints    = [];

        this.stationSeed = this.hashStr(data?.stationName ?? 'SECTOR 1');
        this.bayCount    = 3 + (this.stationSeed % 3);
        if (this.assignedBayIndex >= this.bayCount)
            this.assignedBayIndex = this.bayCount - 1;

        this.buildHangar();
        this.buildTerrain();
        this.drawScene(data?.stationName ?? '');
        this.createShip();

        this.statusText = this.add.text(30, 30, '', { color: '#000', fontSize: '22px', fontStyle: 'bold' });

        const bayNames = ['ALPHA', 'BETA', 'GAMMA', 'DELTA', 'EPSILON'];
        this.add.text(this.scale.width / 2, 30,
            `TOWER: PROCEED TO BAY ${bayNames[this.assignedBayIndex] ?? 'ALPHA'}`,
            { color: '#000', fontSize: '20px', fontStyle: 'bold', align: 'center',
              backgroundColor: '#fff', padding: { x: 10, y: 5 } }
        ).setOrigin(0.5, 0);

        this.add.text(30, this.scale.height - 50,
            'W: RETRO THRUST  |  A/D: LATERAL  |  ESC: ABORT / DEPART / RETRY',
            { color: '#000', fontSize: '16px' });

        if (this.input.keyboard) {
            this.keyW   = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W);
            this.keyA   = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
            this.keyD   = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);
            this.keyEsc = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
        }
    }

    private hashStr(s: string): number {
        // Use a stronger mix so that sequential station names (SECTOR 1, SECTOR 2 …)
        // hash to well-spread values across mod 3.
        let h = 2166136261;   // FNV-1a 32-bit offset basis
        for (let i = 0; i < s.length; i++) {
            h ^= s.charCodeAt(i);
            h = Math.imul(h, 16777619);   // FNV prime
            h >>>= 0;
        }
        // Extra avalanche pass so even 1-digit differences produce different mod-3
        h ^= h >>> 16;
        h = Math.imul(h, 0x45d9f3b);
        h ^= h >>> 16;
        return h >>> 0;
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  HANGAR
    // ─────────────────────────────────────────────────────────────────────────
    private buildHangar() {
        const W = this.scale.width, H = this.scale.height;
        const bayNames = ['ALPHA', 'BETA', 'GAMMA', 'DELTA', 'EPSILON'];
        const bayW     = 100;
        const type: HangarType = (['bunker', 'surface', 'shaft'] as HangarType[])[this.stationSeed % 3];

        const mkBays = (left: number, floorY: number): Bay[] => {
            const bays: Bay[] = [];
            for (let i = 0; i < this.bayCount; i++)
                bays.push({ x: left + 40 + i * (bayW + 10) + bayW / 2, y: floorY, width: bayW, name: bayNames[i] });
            return bays;
        };

        switch (type) {
            case 'bunker': {
                const hW = bayW * this.bayCount + 80;
                const hL = (W - hW) / 2, hR = hL + hW;
                const fY = H - 100, cY = H - 290;
                this.hangar = { type, left: hL, right: hR, floorY: fY, ceilingY: cY,
                    entryLeft: hL, entryRight: hR, entryTop: cY, bays: mkBays(hL, fY) };
                break;
            }
            case 'surface': {
                const hW  = bayW * this.bayCount + 100;
                const hL  = (W - hW) / 2, hR = hL + hW;
                const fY  = H - 140, cY = H - 350;
                const eW  = 80;
                const emx = (hL + hR) / 2;
                this.hangar = { type, left: hL, right: hR, floorY: fY, ceilingY: cY,
                    entryLeft: emx - eW / 2, entryRight: emx + eW / 2, entryTop: cY,
                    bays: mkBays(hL, fY) };
                break;
            }
            case 'shaft': {
                const hW  = bayW * this.bayCount + 80;
                const hL  = (W - hW) / 2, hR = hL + hW;
                const fY  = H - 80, cY = H - 270;
                const shW = 90;
                const sx  = W / 2;
                this.hangar = { type, left: hL, right: hR, floorY: fY, ceilingY: cY,
                    entryLeft: sx - shW / 2, entryRight: sx + shW / 2, entryTop: 70,
                    bays: mkBays(hL, fY) };
                break;
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  TERRAIN
    // ─────────────────────────────────────────────────────────────────────────
    private buildTerrain() {
        const W = this.scale.width, H = this.scale.height;
        const groundY = H - 80, segs = 60;
        const pts: TerrainPoint[] = [{ x: 0, y: H }];
        const raw: number[] = Array.from({ length: segs + 1 }, () => groundY + Math.random() * 80 - 40);
        for (let p = 0; p < 3; p++)
            for (let i = 1; i < raw.length - 1; i++)
                raw[i] = (raw[i - 1] + raw[i] + raw[i + 1]) / 3;
        for (let i = 0; i <= segs; i++) {
            const px = (i / segs) * W;
            let   py = raw[i];
            const h  = this.hangar;
            if (px >= h.left - 20 && px <= h.right + 20) py = h.floorY + 30;
            pts.push({ x: px, y: py });
        }
        pts.push({ x: W, y: H });
        this.terrainPoints = pts;
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  DRAW
    // ─────────────────────────────────────────────────────────────────────────
    private drawScene(stationName: string) {
        const W = this.scale.width, H = this.scale.height;
        const g = this.add.graphics(), h = this.hangar;
        const bayNames = ['ALPHA', 'BETA', 'GAMMA', 'DELTA', 'EPSILON'];

        // Sky bands
        for (let i = 0; i < 6; i++) {
            g.fillStyle(0x000000, 0.03 + i * 0.012);
            g.fillRect(0, H * 0.45 + i * H * 0.09, W, H * 0.09);
        }
        // Stars
        g.fillStyle(0x000000, 0.22);
        for (let i = 0; i < 70; i++)
            g.fillCircle(Math.random() * W, Math.random() * H * 0.5, 1 + Math.random() * 1.5);
        // Station silhouette
        g.fillStyle(0x000000, 0.05);
        g.beginPath(); g.arc(W * 0.5, H * 0.35, 220, Math.PI, 0); g.closePath(); g.fillPath();
        for (let t = 0; t < 5; t++) {
            g.fillRect(W * 0.25 + t * W * 0.12 - 7, H * 0.35 - 70 - (this.stationSeed * (t + 1) * 17) % 90, 14, 70 + (this.stationSeed * (t + 1) * 17) % 90);
        }

        // Terrain
        g.fillStyle(0x000000, 0.13);
        g.beginPath();
        this.terrainPoints.forEach((p, i) => i === 0 ? g.moveTo(p.x, p.y) : g.lineTo(p.x, p.y));
        g.closePath(); g.fillPath();
        g.lineStyle(3, 0x000000, 1);
        g.beginPath();
        g.moveTo(this.terrainPoints[1].x, this.terrainPoints[1].y);
        for (let i = 2; i < this.terrainPoints.length - 1; i++)
            g.lineTo(this.terrainPoints[i].x, this.terrainPoints[i].y);
        g.strokePath();

        // Hangar
        switch (h.type) {
            case 'bunker':  this.drawBunker(g, h, bayNames);  break;
            case 'surface': this.drawSurface(g, h, bayNames); break;
            case 'shaft':   this.drawShaft(g, h, bayNames);   break;
        }

        if (stationName)
            this.add.text(W / 2, H * 0.38, stationName, { color: '#000', fontSize: '22px', fontStyle: 'bold' })
                .setOrigin(0.5).setAlpha(0.14);
    }

    private clearInterior(g: Phaser.GameObjects.Graphics, h: Hangar) {
        // Stamp a white fill over the interior so terrain/sky doesn't bleed through
        const interior = this.add.graphics();
        interior.fillStyle(0xffffff, 1);
        interior.fillRect(h.left, h.ceilingY, h.right - h.left, h.floorY - h.ceilingY);
    }

    private drawBunker(g: Phaser.GameObjects.Graphics, h: Hangar, bayNames: string[]) {
        this.clearInterior(g, h);
        // Rock hatching
        g.lineStyle(1, 0x000000, 0.14);
        for (let y = h.ceilingY + 8; y < h.floorY; y += 16) {
            g.strokeLineShape(new Phaser.Geom.Line(h.left, y, h.left + 16, y + 9));
            g.strokeLineShape(new Phaser.Geom.Line(h.right - 16, y, h.right, y + 9));
        }
        // Walls & ceiling
        g.lineStyle(4, 0x000000, 1);
        g.strokeLineShape(new Phaser.Geom.Line(h.left, h.ceilingY, h.right, h.ceilingY));
        g.strokeLineShape(new Phaser.Geom.Line(h.left,  h.ceilingY, h.left,  h.floorY));
        g.strokeLineShape(new Phaser.Geom.Line(h.right, h.ceilingY, h.right, h.floorY));
        // Ceiling lights
        for (let lx = h.left + 35; lx < h.right; lx += 55) {
            g.fillStyle(0x000000, 0.8); g.fillRect(lx - 12, h.ceilingY, 24, 6);
            g.fillStyle(0x000000, 0.08);
            g.fillTriangle(lx - 18, h.ceilingY + 6, lx + 18, h.ceilingY + 6, lx, h.ceilingY + 32);
        }
        this.drawBays(g, h, bayNames);
    }

    private drawSurface(g: Phaser.GameObjects.Graphics, h: Hangar, bayNames: string[]) {
        this.clearInterior(g, h);
        // Outer shell
        g.lineStyle(5, 0x000000, 1);
        g.strokeLineShape(new Phaser.Geom.Line(h.left,  h.ceilingY, h.left,  h.floorY));
        g.strokeLineShape(new Phaser.Geom.Line(h.right, h.ceilingY, h.right, h.floorY));
        g.strokeLineShape(new Phaser.Geom.Line(h.left,  h.ceilingY, h.entryLeft,  h.ceilingY));
        g.strokeLineShape(new Phaser.Geom.Line(h.entryRight, h.ceilingY, h.right, h.ceilingY));
        // Entry funnel
        g.lineStyle(2, 0x000000, 0.45);
        g.strokeLineShape(new Phaser.Geom.Line(h.entryLeft,  h.ceilingY, h.entryLeft  - 18, h.ceilingY - 45));
        g.strokeLineShape(new Phaser.Geom.Line(h.entryRight, h.ceilingY, h.entryRight + 18, h.ceilingY - 45));
        // Window details
        g.lineStyle(1.5, 0x000000, 0.35);
        for (let wy = h.ceilingY + 18; wy < h.floorY - 28; wy += 32) {
            g.strokeRect(h.left + 8, wy, 14, 18);
            g.strokeRect(h.right - 22, wy, 14, 18);
        }
        // Lights
        for (let lx = h.left + 30; lx < h.right; lx += 52) {
            g.fillStyle(0x000000, 0.75); g.fillRect(lx - 10, h.ceilingY + 2, 20, 5);
        }
        this.drawBays(g, h, bayNames);
    }

    private drawShaft(g: Phaser.GameObjects.Graphics, h: Hangar, bayNames: string[]) {
        // Clear shaft tunnel + chamber
        const shaft = this.add.graphics();
        shaft.fillStyle(0xffffff, 1);
        shaft.fillRect(h.left, h.ceilingY, h.right - h.left, h.floorY - h.ceilingY);
        shaft.fillRect(h.entryLeft, h.entryTop, h.entryRight - h.entryLeft, h.ceilingY - h.entryTop);

        // Shaft walls
        g.lineStyle(4, 0x000000, 1);
        g.strokeLineShape(new Phaser.Geom.Line(h.entryLeft,  h.entryTop, h.entryLeft,  h.ceilingY));
        g.strokeLineShape(new Phaser.Geom.Line(h.entryRight, h.entryTop, h.entryRight, h.ceilingY));
        // Chamber
        g.strokeLineShape(new Phaser.Geom.Line(h.left, h.ceilingY, h.entryLeft,  h.ceilingY));
        g.strokeLineShape(new Phaser.Geom.Line(h.entryRight, h.ceilingY, h.right, h.ceilingY));
        g.strokeLineShape(new Phaser.Geom.Line(h.left,  h.ceilingY, h.left,  h.floorY));
        g.strokeLineShape(new Phaser.Geom.Line(h.right, h.ceilingY, h.right, h.floorY));
        // Descent arrows in shaft
        const mx = (h.entryLeft + h.entryRight) / 2;
        g.lineStyle(1.5, 0x000000, 0.4);
        for (let ay = h.entryTop + 22; ay < h.ceilingY - 18; ay += 38)
            g.strokeTriangle(mx, ay + 13, mx - 9, ay, mx + 9, ay);
        // Depth markers
        g.lineStyle(1, 0x000000, 0.28);
        for (let my = h.entryTop + 28; my < h.ceilingY; my += 18) {
            g.strokeLineShape(new Phaser.Geom.Line(h.entryLeft, my, h.entryLeft + 7, my));
            g.strokeLineShape(new Phaser.Geom.Line(h.entryRight - 7, my, h.entryRight, my));
        }
        // Rock hatching beside shaft
        g.lineStyle(1, 0x000000, 0.11);
        for (let ry = h.entryTop; ry < h.ceilingY; ry += 14) {
            if (h.entryLeft > 15)
                g.strokeLineShape(new Phaser.Geom.Line(h.entryLeft - 14, ry, h.entryLeft, ry + 7));
            if (h.entryRight < this.scale.width - 15)
                g.strokeLineShape(new Phaser.Geom.Line(h.entryRight, ry, h.entryRight + 14, ry + 7));
        }
        // Chamber ceiling lights
        for (let lx = h.left + 32; lx < h.right; lx += 58) {
            g.fillStyle(0x000000, 0.75); g.fillRect(lx - 10, h.ceilingY, 20, 5);
            g.fillStyle(0x000000, 0.07);
            g.fillTriangle(lx - 16, h.ceilingY + 5, lx + 16, h.ceilingY + 5, lx, h.ceilingY + 28);
        }
        this.drawBays(g, h, bayNames);
    }

    private drawBays(g: Phaser.GameObjects.Graphics, h: Hangar, bayNames: string[]) {
        for (let i = 0; i < h.bays.length; i++) {
            const bay     = h.bays[i];
            const isAsgn  = i === this.assignedBayIndex;
            const hw      = bay.width / 2;

            g.lineStyle(isAsgn ? 5 : 3, 0x000000, isAsgn ? 1 : 0.45);
            g.strokeLineShape(new Phaser.Geom.Line(bay.x - hw, bay.y, bay.x + hw, bay.y));
            g.lineStyle(2, 0x000000, 0.55);
            g.strokeLineShape(new Phaser.Geom.Line(bay.x - hw, bay.y - 22, bay.x - hw, bay.y));
            g.strokeLineShape(new Phaser.Geom.Line(bay.x + hw, bay.y - 22, bay.x + hw, bay.y));

            // Approach lights
            for (let d = 0; d < 4; d++) {
                g.fillStyle(0x000000, isAsgn ? 0.9 : 0.22);
                g.fillCircle(bay.x - hw + (bay.width / 3) * d, bay.y - 4, 3.5);
            }

            this.add.text(bay.x, bay.y + 8, bay.name, {
                color: isAsgn ? '#000' : '#999',
                fontSize: isAsgn ? '16px' : '13px',
                fontStyle: isAsgn ? 'bold' : 'normal',
            }).setOrigin(0.5, 0);

            if (isAsgn) {
                g.fillStyle(0x000000, 0.85);
                g.fillTriangle(bay.x, bay.y - 28, bay.x - 10, bay.y - 44, bay.x + 10, bay.y - 44);
                g.lineStyle(1.5, 0x000000, 0.35);
                for (let dy = h.ceilingY + 12; dy < bay.y - 48; dy += 13)
                    g.strokeLineShape(new Phaser.Geom.Line(bay.x, dy, bay.x, Math.min(dy + 8, bay.y - 48)));
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  SHIP
    // ─────────────────────────────────────────────────────────────────────────
    private createShip() {
        const h = this.hangar;
        let spawnX: number, spawnY: number;
        if (h.type === 'bunker') {
            // Open top — spawn centred above the pit, well above ceilingY
            spawnX = (h.left + h.right) / 2;
            spawnY = h.ceilingY - 50;
        } else {
            // surface / shaft — spawn centred on the entry gap, above it
            spawnX = (h.entryLeft + h.entryRight) / 2;
            spawnY = h.entryTop - 40;
        }
        this.ship = this.add.container(spawnX, spawnY);
        const sg  = this.add.graphics();
        this.drawLanderGraphic(sg);
        this.ship.add(sg);
        this.thrustGraphics = this.add.graphics();
        this.ship.add(this.thrustGraphics);
    }

    private drawLanderGraphic(g: Phaser.GameObjects.Graphics) {
        g.clear();
        g.lineStyle(2.5, 0x000000, 1); g.fillStyle(0xffffff, 1);
        g.fillRect(-14, -10, 28, 20); g.strokeRect(-14, -10, 28, 20);
        g.beginPath(); g.arc(0, -10, 10, Math.PI, 0); g.closePath(); g.fillPath(); g.strokePath();
        g.fillStyle(0x000000, 1); g.fillCircle(0, -9, 5);
        g.fillStyle(0xffffff, 0.6); g.fillCircle(-1.5, -10.5, 2);
        g.lineStyle(2, 0x000000, 1);
        g.strokeLineShape(new Phaser.Geom.Line(-14, 8, -22, 18));
        g.strokeLineShape(new Phaser.Geom.Line(-22, 18, -26, 18));
        g.strokeLineShape(new Phaser.Geom.Line(14, 8, 22, 18));
        g.strokeLineShape(new Phaser.Geom.Line(22, 18, 26, 18));
        g.fillStyle(0x333333, 1); g.fillRect(-8, 10, 16, 6);
        g.lineStyle(1.5, 0x000000, 1); g.strokeRect(-8, 10, 16, 6);
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  UPDATE
    // ─────────────────────────────────────────────────────────────────────────
    update(_t: number, delta: number) {
        if (Phaser.Input.Keyboard.JustDown(this.keyEsc)) { this.leaveScene(); return; }
        if (this.landingStatus !== 'flying') return;

        const dt = Math.min(delta, 32) / 16.6;
        this.velocity.y += this.gravity * dt;
        this.thrustGraphics.clear();

        if (this.keyW.isDown) { this.velocity.y -= this.thrustPower * dt;       this.drawThrust(0, 16); }
        if (this.keyA.isDown) { this.velocity.x -= this.thrustPower * 0.5 * dt; this.drawSideThrust(26, 0); }
        if (this.keyD.isDown) { this.velocity.x += this.thrustPower * 0.5 * dt; this.drawSideThrust(-26, 0); }
        this.velocity.x = Phaser.Math.Clamp(this.velocity.x, -9, 9);

        this.ship.x += this.velocity.x * dt;
        this.ship.y += this.velocity.y * dt;

        this.statusText.setText(
            `V-SPEED: ${Math.abs(this.velocity.y).toFixed(1)}\nH-SPEED: ${Math.abs(this.velocity.x).toFixed(1)}`
        );

        this.checkCollisions();

        if (this.ship.x < -30)                   this.ship.x = this.scale.width + 30;
        if (this.ship.x > this.scale.width + 30)  this.ship.x = -30;
        if (this.ship.y < -60) { this.ship.y = -40; this.velocity.y = Math.max(this.velocity.y, 0); }
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  COLLISION
    // ─────────────────────────────────────────────────────────────────────────
    private checkCollisions() {
        const h         = this.hangar;
        const shipTop   = this.ship.y + this.SHIP_TOP;
        const shipBot   = this.ship.y + this.SHIP_BOTTOM;
        const shipLeft  = this.ship.x - this.SHIP_HALF_W;
        const shipRight = this.ship.x + this.SHIP_HALF_W;

        // Bunker is open-top: ship is "in chamber" as soon as it crosses the horizontal bounds,
        // regardless of vertical position.  Surface/shaft use the ceilingY threshold.
        const inChamber = this.ship.x > h.left && this.ship.x < h.right && (
            h.type === 'bunker'
                ? this.ship.y >= h.ceilingY - 10   // small grace zone so fall-in is clean
                : this.ship.y >= h.ceilingY
        );
        const inShaft   = h.type === 'shaft'
            && this.ship.x > h.entryLeft && this.ship.x < h.entryRight
            && this.ship.y < h.ceilingY;

        // ── CEILING ──
        // Bunker is fully open at the top — no ceiling collision at all.
        // Surface has a roof with a gap: only collide where the roof actually exists.
        // Shaft: ceiling is the bottom of the shaft tunnel (transition into the chamber).
        const hasCeiling = (
            (h.type === 'surface' && inChamber &&
             (this.ship.x < h.entryLeft || this.ship.x > h.entryRight)) ||
            (h.type === 'shaft' && inShaft)
        );
        if (hasCeiling && shipTop <= h.ceilingY && this.ship.y > h.ceilingY - 60) {
            const spd = Math.abs(this.velocity.y);
            this.ship.y = h.ceilingY - this.SHIP_TOP;
            if (spd > this.CEILING_CRASH_SPEED) { this.onCrash(); return; }
            this.velocity.y = Math.abs(this.velocity.y) * 0.4;
        }

        // ── SHAFT SIDE WALLS ──
        if (h.type === 'shaft' && this.ship.y < h.ceilingY) {
            if (shipLeft < h.entryLeft) {
                this.ship.x = h.entryLeft + this.SHIP_HALF_W + 2;
                if (Math.abs(this.velocity.x) > this.CEILING_CRASH_SPEED) { this.onCrash(); return; }
                this.velocity.x = Math.abs(this.velocity.x) * 0.4;
            }
            if (shipRight > h.entryRight) {
                this.ship.x = h.entryRight - this.SHIP_HALF_W - 2;
                if (Math.abs(this.velocity.x) > this.CEILING_CRASH_SPEED) { this.onCrash(); return; }
                this.velocity.x = -Math.abs(this.velocity.x) * 0.4;
            }
        }

        // ── CHAMBER SIDE WALLS ──
        if (inChamber) {
            if (shipLeft < h.left) {
                this.ship.x = h.left + this.SHIP_HALF_W + 2;
                if (Math.abs(this.velocity.x) > this.CEILING_CRASH_SPEED) { this.onCrash(); return; }
                this.velocity.x = Math.abs(this.velocity.x) * 0.4;
            }
            if (shipRight > h.right) {
                this.ship.x = h.right - this.SHIP_HALF_W - 2;
                if (Math.abs(this.velocity.x) > this.CEILING_CRASH_SPEED) { this.onCrash(); return; }
                this.velocity.x = -Math.abs(this.velocity.x) * 0.4;
            }
        }

        // ── FLOOR / BAY LANDING ──
        if (inChamber && shipBot >= h.floorY) {
            const impactV = Math.abs(this.velocity.y);
            const impactH = Math.abs(this.velocity.x);
            this.ship.y   = h.floorY - this.SHIP_BOTTOM;
            this.velocity.set(0, 0);
            if (impactV > 2.8 || impactH > 2.0) { this.onCrash(); return; }

            let bay = -1;
            for (let i = 0; i < h.bays.length; i++) {
                const b = h.bays[i];
                if (this.ship.x >= b.x - b.width / 2 && this.ship.x <= b.x + b.width / 2) bay = i;
            }
            if (bay < 0)                            this.onCrash();
            else if (bay === this.assignedBayIndex)  this.onLandedCorrect();
            else                                    this.onLandedWrongBay(bay);
            return;
        }

        // ── TERRAIN (outside hangar) ──
        if (!inChamber && !inShaft) {
            const ty = this.getTerrainY(this.ship.x);
            if (shipBot >= ty) this.onCrash();
        }
    }

    private getTerrainY(wx: number): number {
        const pts = this.terrainPoints;
        for (let i = 1; i < pts.length - 1; i++) {
            if (wx >= pts[i].x && wx <= pts[i + 1].x) {
                const t = (wx - pts[i].x) / (pts[i + 1].x - pts[i].x || 1);
                return pts[i].y + t * (pts[i + 1].y - pts[i].y);
            }
        }
        return pts[1]?.y ?? this.scale.height - 80;
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  OUTCOMES
    // ─────────────────────────────────────────────────────────────────────────
    private onCrash() {
        if (this.landingStatus !== 'flying') return;
        this.landingStatus = 'crashed';
        this.statusText.setText('CRASHED!\nPRESS ESC TO RETRY');
        this.ship.setAlpha(0.3);
        this.cameras.main.shake(280, 0.011);
    }

    private onLandedCorrect() {
        this.landingStatus = 'landed';
        this.statusText.setText('LANDING SUCCESSFUL!\nPRESS ESC TO DEPART');
    }

    private onLandedWrongBay(bayIndex: number) {
        this.landingStatus = 'fined';
        const n = ['ALPHA', 'BETA', 'GAMMA', 'DELTA', 'EPSILON'];
        this.statusText.setText(
            `UNAUTHORISED LANDING — BAY ${n[bayIndex] ?? bayIndex + 1}!\n` +
            `ASSIGNED: ${n[this.assignedBayIndex] ?? 'ALPHA'}\n` +
            `FINE: 500 CREDITS DEDUCTED.\n\nPRESS ESC TO DEPART`
        );
        this.tweens.add({ targets: this.ship, alpha: { from: 1, to: 0.3 }, duration: 80, yoyo: true, repeat: 6 });
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  THRUST FX
    // ─────────────────────────────────────────────────────────────────────────
    private drawThrust(x: number, y: number) {
        const sz = 14 + Math.random() * 10;
        this.thrustGraphics.fillStyle(0xffaa00, 0.4);
        this.thrustGraphics.fillPoints([
            new Phaser.Math.Vector2(x - 6, y), new Phaser.Math.Vector2(x, y + sz), new Phaser.Math.Vector2(x + 6, y),
        ], true);
        this.thrustGraphics.fillStyle(0xffffff, 0.65);
        this.thrustGraphics.fillPoints([
            new Phaser.Math.Vector2(x - 3, y), new Phaser.Math.Vector2(x, y + sz * 0.55), new Phaser.Math.Vector2(x + 3, y),
        ], true);
    }

    private drawSideThrust(x: number, _y: number) {
        const sz = 10 + Math.random() * 6, dir = x > 0 ? 1 : -1;
        this.thrustGraphics.fillStyle(0xffaa00, 0.35);
        this.thrustGraphics.fillPoints([
            new Phaser.Math.Vector2(x, -4), new Phaser.Math.Vector2(x + dir * sz, 0), new Phaser.Math.Vector2(x, 4),
        ], true);
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  LEAVE
    // ─────────────────────────────────────────────────────────────────────────
    private leaveScene() {
        if (this.landingStatus === 'crashed') {
            this.scene.restart({
                assignedBayIndex: this.assignedBayIndex,
                returnX: this.returnX, returnY: this.returnY,
                returnVX: this.returnVX, returnVY: this.returnVY,
            });
        } else {
            this.scene.stop();
            this.scene.start('GameScene', {
                returnX: this.returnX, returnY: this.returnY,
                returnVX: this.returnVX, returnVY: this.returnVY,
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
    scene:   [GameScene, LandingScene],
    physics: { default: 'arcade', arcade: { debug: false } },
};
// @ts-ignore
window.game = new Phaser.Game(config);
window.addEventListener('resize', () => {
    // @ts-ignore
    if (window.game) window.game.scale.resize(window.innerWidth, window.innerHeight);
});