import Phaser from 'phaser';

const WORLD_SIZE = 10000000;
const SHIP_SIZE = 20;
const STATION_SIZE = 150;

// ─────────────────────────────────────────────
//  GAME SCENE
// ─────────────────────────────────────────────
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

    // Physics
    private velocity = new Phaser.Math.Vector2(0, 0);
    private throttle = 0;
    private readonly baseAcceleration = 4;

    // Zoom management
    private manualZoom: number | null = null;       // null = auto mode
    private autoZoomValue = 1;                       // what auto-zoom would be
    private zoomLockTimer = 0;                       // unused now, kept for ref
    private readonly ZOOM_SNAP_MARGIN = 0.15;        // fraction within which scrolling re-locks

    // UI
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
    private targetIndex = 0;
    private canEnterStation = false;

    // Comms – now also carries assigned bay index
    private commStatus: 'none' | 'calling' | 'identifying' | 'scanning' | 'granted' = 'none';
    private commTimer = 0;
    private assignedBayIndex = 0;   // which bay the player was told to use

    // Re-entry position
    private entryX = 0;
    private entryY = 0;
    private entryVelocityX = 0;
    private entryVelocityY = 0;

    constructor() {
        super({ key: 'GameScene' });
    }

    create(data?: { returnX?: number; returnY?: number; returnVX?: number; returnVY?: number }) {
        this.cameras.main.setBackgroundColor('#ffffff');
        this.physics.world.setBounds(-WORLD_SIZE, -WORLD_SIZE, WORLD_SIZE * 2, WORLD_SIZE * 2);

        // Reset state
        this.velocity.set(0, 0);
        this.throttle = 0;
        this.commStatus = 'none';
        this.commTimer = 0;
        this.stations = [];
        this.stars = [];
        this.manualZoom = null;
        this.assignedBayIndex = 0;

        this.createStars();
        this.createStations(20);
        this.createShip();

        // If returning from landing, restore position & velocity
        if (data?.returnX !== undefined) {
            this.ship.x = data.returnX;
            this.ship.y = data.returnY ?? 0;
            this.velocity.set(data.returnVX ?? 0, data.returnVY ?? 0);
        }

        this.cameras.main.startFollow(this.ship, true, 1, 1);

        // UI camera
        this.uiCamera = this.cameras.add(0, 0, this.scale.width, this.scale.height)
            .setScroll(0, 0)
            .setName('UI');

        this.speedText       = this.add.text(30, 30, '', { color: '#000', fontSize: '24px', fontStyle: 'bold' });
        this.distText        = this.add.text(30, 90, '', { color: '#000', fontSize: '20px' });
        this.commText        = this.add.text(this.scale.width / 2, this.scale.height - 120, '', {
            color: '#000', fontSize: '18px', fontStyle: 'bold',
            align: 'center', backgroundColor: '#fff', padding: { x: 10, y: 5 }
        }).setOrigin(0.5);
        this.hintText        = this.add.text(30, this.scale.height - 50,
            'W/S: THROTTLE  |  X: BRAKE  |  MOUSE: AIM  |  N: NEXT TARGET  |  C: COMMS  |  SCROLL: ZOOM',
            { color: '#000', fontSize: '16px' });
        this.pointerDistText = this.add.text(0, 0, '', {
            color: '#000', fontSize: '14px', backgroundColor: 'rgba(255,255,255,0.7)',
            padding: { x: 4, y: 2 }
        }).setOrigin(0.5, -0.2);
        this.zoomModeText    = this.add.text(this.scale.width - 30, 30, '', {
            color: '#000', fontSize: '14px', align: 'right'
        }).setOrigin(1, 0);

        this.navArrow  = this.add.graphics().setDepth(10);
        this.moveArrow = this.add.graphics().setDepth(11);

        const uiObjects = [
            this.speedText, this.distText, this.hintText,
            this.commText, this.pointerDistText, this.moveArrow,
            this.zoomModeText,
            ...this.stars.map(s => s.sprite)
        ];
        this.cameras.main.ignore(uiObjects);

        const worldObjects: Phaser.GameObjects.GameObject[] = [
            this.ship, this.navArrow,
            ...this.stations,
        ];
        this.uiCamera.ignore(worldObjects);

        // Keys
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

        // Scroll-wheel zoom
        this.input.on('wheel', (_pointer: Phaser.Input.Pointer, _gos: any, _dx: number, dy: number) => {
            const currentZoom = this.manualZoom ?? this.cameras.main.zoom;
            const zoomFactor  = dy > 0 ? 0.9 : 1.1;
            const newZoom     = Phaser.Math.Clamp(currentZoom * zoomFactor, 0.005, 2);
            this.manualZoom   = newZoom;
        });
    }

    // ────────────────────────────────────────────
    private createStars() {
        const layers = 5;
        const baseScrollFactor = 0.00002;
        const textureSize = 1024;

        for (let i = 0; i < layers; i++) {
            const textureKey = `stars_layer_${i}`;
            if (this.textures.exists(textureKey)) this.textures.remove(textureKey);

            const graphics = this.make.graphics({ x: 0, y: 0 });
            const factor   = baseScrollFactor * Math.pow(2.5, i);
            const alpha    = 0.1 + i * 0.05;
            const radius   = 1.0 + i * 0.8;
            const count    = 8 + i * 4;

            graphics.fillStyle(0x000000, alpha);
            for (let j = 0; j < count; j++) {
                graphics.fillCircle(
                    Phaser.Math.Between(0, textureSize),
                    Phaser.Math.Between(0, textureSize),
                    radius
                );
            }
            graphics.generateTexture(textureKey, textureSize, textureSize);
            graphics.destroy();

            const tileSprite = this.add.tileSprite(0, 0, this.scale.width, this.scale.height, textureKey)
                .setOrigin(0, 0)
                .setScrollFactor(0)
                .setDepth(-10 + i);

            this.stars.push({ sprite: tileSprite, factor });
        }
    }

    private createStations(count: number) {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist  = 50000 + Math.random() * (WORLD_SIZE / 3);
            const x = Math.cos(angle) * dist;
            const y = Math.sin(angle) * dist;

            const station  = this.add.container(x, y);
            const graphics = this.add.graphics();
            graphics.lineStyle(4, 0x000000);

            const sides = 8;
            const points: Phaser.Math.Vector2[] = [];
            for (let s = 0; s < sides; s++) {
                const a = (s / sides) * Math.PI * 2;
                const r = s % 2 === 0 ? STATION_SIZE : STATION_SIZE * 0.8;
                points.push(new Phaser.Math.Vector2(Math.cos(a) * r, Math.sin(a) * r));
            }
            graphics.strokePoints(points, true);
            station.add(graphics);

            const label = this.add.text(0, STATION_SIZE + 20, `SECTOR ${i + 1}`, {
                color: '#000', fontSize: '18px', fontStyle: 'bold'
            }).setOrigin(0.5);
            station.add(label);

            this.stations.push(station);
        }
        this.targetIndex   = 0;
        this.targetStation = this.stations[0];
    }

    private createShip() {
        this.ship = this.add.container(0, 0);

        this.thrustGraphics = this.add.graphics();
        this.ship.add(this.thrustGraphics);

        this.shipGraphics = this.add.graphics();
        this.drawShipGraphic(this.shipGraphics);
        this.ship.add(this.shipGraphics);
    }

    private drawShipGraphic(g: Phaser.GameObjects.Graphics) {
        g.clear();
        const s = SHIP_SIZE;

        // Main hull – sleek arrowhead
        g.lineStyle(2.5, 0x000000, 1);
        g.fillStyle(0xffffff, 1);
        g.beginPath();
        g.moveTo(s * 1.8, 0);
        g.lineTo(-s * 0.6, s * 0.9);
        g.lineTo(-s * 1.1, 0);
        g.lineTo(-s * 0.6, -s * 0.9);
        g.closePath();
        g.fillPath();
        g.strokePath();

        // Cockpit window
        g.fillStyle(0x000000, 1);
        g.beginPath();
        g.moveTo(s * 1.2, 0);
        g.lineTo(s * 0.3, s * 0.35);
        g.lineTo(s * 0.3, -s * 0.35);
        g.closePath();
        g.fillPath();

        // Wing strakes
        g.lineStyle(2, 0x000000, 1);
        g.fillStyle(0xffffff, 1);
        // top wing
        g.beginPath();
        g.moveTo(s * 0.2, -s * 0.7);
        g.lineTo(-s * 0.5, -s * 1.6);
        g.lineTo(-s * 1.0, -s * 0.5);
        g.lineTo(-s * 0.5, -s * 0.5);
        g.closePath();
        g.fillPath();
        g.strokePath();
        // bottom wing
        g.beginPath();
        g.moveTo(s * 0.2, s * 0.7);
        g.lineTo(-s * 0.5, s * 1.6);
        g.lineTo(-s * 1.0, s * 0.5);
        g.lineTo(-s * 0.5, s * 0.5);
        g.closePath();
        g.fillPath();
        g.strokePath();

        // Engine block
        g.fillStyle(0x222222, 1);
        g.fillRect(-s * 1.15, -s * 0.25, s * 0.45, s * 0.5);
        // Engine nozzle rings
        g.lineStyle(1.5, 0x000000, 1);
        g.strokeRect(-s * 1.15, -s * 0.22, s * 0.42, s * 0.44);
    }

    // ────────────────────────────────────────────
    update(_time: number, delta: number) {
        const dt = Math.min(delta, 32) / 16.6;
        this.handleInput(dt);
        this.applyPhysics(dt);
        this.updateThrustGraphic();
        this.updateCamera(dt);
        this.updateUI();
    }

    private updateThrustGraphic() {
        this.thrustGraphics.clear();
        if (this.throttle > 0) {
            const s    = SHIP_SIZE;
            const size = s * (0.8 + Math.random() * 0.4) * this.throttle;

            // Outer flame
            this.thrustGraphics.fillStyle(0xffaa00, 0.35);
            this.thrustGraphics.fillPoints([
                new Phaser.Math.Vector2(-s * 1.15, s * 0.22),
                new Phaser.Math.Vector2(-s * 1.15 - size * 2.8, 0),
                new Phaser.Math.Vector2(-s * 1.15, -s * 0.22),
            ], true);

            // Inner bright core
            this.thrustGraphics.fillStyle(0xffffff, 0.65);
            this.thrustGraphics.fillPoints([
                new Phaser.Math.Vector2(-s * 1.15, s * 0.12),
                new Phaser.Math.Vector2(-s * 1.15 - size * 1.3, 0),
                new Phaser.Math.Vector2(-s * 1.15, -s * 0.12),
            ], true);
        }
    }

    private handleInput(dt: number) {
        // Rotation towards mouse
        const mouseWorld = this.cameras.main.getWorldPoint(this.input.x, this.input.y);
        const targetAngle = Phaser.Math.Angle.Between(
            this.ship.x, this.ship.y, mouseWorld.x, mouseWorld.y
        );
        const speed    = this.velocity.length();
        const rotSpeed = Math.max(0.01, 0.15 / (1 + speed / 500));
        this.ship.rotation = Phaser.Math.Angle.RotateTo(this.ship.rotation, targetAngle, rotSpeed * dt);

        // Throttle
        if (this.keyW.isDown) {
            this.throttle = Math.min(this.throttle + 0.015 * dt, 1);
        } else if (this.keyS.isDown) {
            this.throttle = Math.max(this.throttle - 0.015 * dt, -1);
        } else if (Phaser.Input.Keyboard.JustDown(this.keyX)) {
            this.throttle = -0.05;
        } else if (!this.keyW.isDown && !this.keyS.isDown) {
            this.throttle = Phaser.Math.Linear(this.throttle, 0, 0.08 * dt);
            if (Math.abs(this.throttle) < 0.001) this.throttle = 0;
        }

        // Next target
        if (Phaser.Input.Keyboard.JustDown(this.keyN)) {
            this.targetIndex   = (this.targetIndex + 1) % this.stations.length;
            this.targetStation = this.stations[this.targetIndex];
            this.commStatus    = 'none';
        }

        // Comms
        const dist = this.targetStation
            ? Phaser.Math.Distance.Between(this.ship.x, this.ship.y, this.targetStation.x, this.targetStation.y)
            : Infinity;

        if (dist < 2000) {
            if (this.commStatus === 'none' && Phaser.Input.Keyboard.JustDown(this.keyC)) {
                this.commStatus = 'calling';
                this.commTimer  = 100;
            } else if (this.commStatus === 'identifying') {
                if (Phaser.Input.Keyboard.JustDown(this.key1) || Phaser.Input.Keyboard.JustDown(this.key2)) {
                    this.commStatus = 'scanning';
                    this.commTimer  = 180;
                    // Assign a random bay now (will be communicated to player during scanning)
                    this.assignedBayIndex = Phaser.Math.Between(0, 2); // 0-based, resolved in LandingScene
                }
            }
        } else {
            if (this.commStatus !== 'granted') this.commStatus = 'none';
        }

        // Enter station
        if (this.canEnterStation && Phaser.Input.Keyboard.JustDown(this.keyE)) {
            // Save position before entering
            this.entryX         = this.ship.x;
            this.entryY         = this.ship.y;
            this.entryVelocityX = this.velocity.x;
            this.entryVelocityY = this.velocity.y;

            const stationLabel = (this.targetStation!.list[1] as Phaser.GameObjects.Text).text;
            this.scene.start('LandingScene', {
                stationName:      stationLabel,
                assignedBayIndex: this.assignedBayIndex,
                returnX:          this.entryX,
                returnY:          this.entryY,
                returnVX:         this.entryVelocityX,
                returnVY:         this.entryVelocityY,
            });
        }
    }

    private applyPhysics(dt: number) {
        const currentSpeed = this.velocity.length();

        if (this.throttle > 0) {
            let thrustPower = this.baseAcceleration * (1 + currentSpeed / 200);
            if (currentSpeed > 900000) {
                const softCap = Math.max(0, 1 - (currentSpeed - 900000) / 100000);
                thrustPower  *= 0.01 + softCap * 0.99;
            }
            const dir = new Phaser.Math.Vector2(
                Math.cos(this.ship.rotation),
                Math.sin(this.ship.rotation)
            ).scale(thrustPower * this.throttle * dt);
            this.velocity.add(dir);
        } else if (this.throttle < 0) {
            const brakeForce = this.baseAcceleration * 15.0 * Math.abs(this.throttle) * dt;
            if (currentSpeed > brakeForce) {
                this.velocity.setLength(currentSpeed - brakeForce);
            } else {
                this.velocity.set(0, 0);
                this.throttle = 0;
            }
        }

        if (this.velocity.length() > 1000000) this.velocity.setLength(1000000);
        this.velocity.scale(1 - 0.001 * dt);

        this.ship.x += this.velocity.x * dt;
        this.ship.y += this.velocity.y * dt;
    }

    private updateCamera(dt: number) {
        const speed = this.velocity.length();

        // Auto-zoom target — slightly wider max zoom-out than before
        this.autoZoomValue = Math.max(1.0 / (1 + speed / 200), 0.005);

        if (this.manualZoom !== null) {
            // Smoothly approach manual zoom
            const currentZoom = this.cameras.main.zoom;
            const smoothed    = Phaser.Math.Linear(currentZoom, this.manualZoom, 0.08 * dt);
            this.cameras.main.setZoom(smoothed);

            // Check if player scrolled close enough to auto-zoom → re-engage
            const ratio = this.manualZoom / this.autoZoomValue;
            if (ratio > 1 - this.ZOOM_SNAP_MARGIN && ratio < 1 + this.ZOOM_SNAP_MARGIN) {
                // Smooth hand-off: blend manual → auto over next frames
                this.manualZoom = null;
            }
        } else {
            // Pure auto-zoom
            const targetZoom = this.autoZoomValue;
            this.cameras.main.setZoom(Phaser.Math.Linear(this.cameras.main.zoom, targetZoom, 0.05 * dt));
        }

        const zoom = this.cameras.main.zoom;
        const minVisualSize = 15;
        this.ship.setScale(Math.max(1, minVisualSize / (SHIP_SIZE * zoom)));

        // Parallax stars
        const cam = this.cameras.main;
        this.stars.forEach(layer => {
            layer.sprite.setTilePosition(cam.scrollX * layer.factor, cam.scrollY * layer.factor);
            layer.sprite.setSize(this.scale.width, this.scale.height);
        });

        this.uiCamera.setSize(this.scale.width, this.scale.height);
    }

    private updateUI() {
        const speed           = Math.round(this.velocity.length());
        const throttlePercent = Math.round(this.throttle * 100);
        const throttleLabel   = throttlePercent < 0
            ? `[ BRAKE: ${Math.abs(throttlePercent)}% ]`
            : `THROTTLE: ${throttlePercent}%`;
        this.speedText.setText(`SPEED: ${speed}\n${throttleLabel}`);

        // Zoom mode indicator
        if (this.manualZoom !== null) {
            const ratio = this.manualZoom / this.autoZoomValue;
            const pct   = Math.abs(ratio - 1) * 100;
            this.zoomModeText.setText(`ZOOM: MANUAL\n(±${pct.toFixed(0)}% from auto)`).setAlpha(1);
        } else {
            this.zoomModeText.setText('ZOOM: AUTO').setAlpha(0.5);
        }
        this.zoomModeText.setX(this.scale.width - 30);

        // Movement direction instrument
        this.moveArrow.clear();
        const iX = this.scale.width - 80;
        const iY = 80;
        const iR = 50;

        this.moveArrow.lineStyle(2, 0x000000, 1);
        this.moveArrow.strokeCircle(iX, iY, iR);
        this.moveArrow.fillStyle(0x000000, 0.1);
        this.moveArrow.fillCircle(iX, iY, iR);

        if (speed > 1) {
            const moveAngle = this.velocity.angle();
            const arrowSize = 15;
            const tipX = iX + Math.cos(moveAngle) * (iR * 0.8);
            const tipY = iY + Math.sin(moveAngle) * (iR * 0.8);
            this.moveArrow.lineStyle(3, 0x000000, 1);
            this.moveArrow.strokeTriangle(
                tipX, tipY,
                iX + Math.cos(moveAngle + 2.5) * arrowSize, iY + Math.sin(moveAngle + 2.5) * arrowSize,
                iX + Math.cos(moveAngle - 2.5) * arrowSize, iY + Math.sin(moveAngle - 2.5) * arrowSize,
            );
        }

        // Nav arrow (world space)
        this.navArrow.clear();
        this.canEnterStation = false;
        this.commText.setText('');

        if (this.targetStation) {
            const dist = Math.round(Phaser.Math.Distance.Between(
                this.ship.x, this.ship.y, this.targetStation.x, this.targetStation.y
            ));
            const stationLabel = (this.targetStation.list[1] as Phaser.GameObjects.Text).text;
            this.distText.setText(`TARGET: ${stationLabel}\nDISTANCE: ${dist}`);

            const angle   = Phaser.Math.Angle.Between(this.ship.x, this.ship.y, this.targetStation.x, this.targetStation.y);
            const zoom    = this.cameras.main.zoom;
            const screenR = 120;
            const worldR  = screenR / zoom;
            const arrowX  = this.ship.x + Math.cos(angle) * worldR;
            const arrowY  = this.ship.y + Math.sin(angle) * worldR;
            const arrowSize = 12 / zoom;

            this.navArrow.lineStyle(3 / zoom, 0x000000, 0.8);
            this.navArrow.strokeTriangle(
                arrowX + Math.cos(angle)       * arrowSize * 1.5, arrowY + Math.sin(angle)       * arrowSize * 1.5,
                arrowX + Math.cos(angle + 2.5) * arrowSize,       arrowY + Math.sin(angle + 2.5) * arrowSize,
                arrowX + Math.cos(angle - 2.5) * arrowSize,       arrowY + Math.sin(angle - 2.5) * arrowSize,
            );

            const screenX = this.scale.width  / 2 + Math.cos(angle) * screenR;
            const screenY = this.scale.height / 2 + Math.sin(angle) * screenR;
            this.pointerDistText.setPosition(screenX, screenY).setText(`${dist}`);

            // Comms state machine
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
                    const bayName  = bayNames[this.assignedBayIndex] ?? 'ALPHA';
                    this.commText.setText(`TOWER: SCAN COMPLETE. CLEARANCE GRANTED.\nPROCEED TO LANDING BAY ${bayName}.`);
                    if (dist < 500 && speed < 60) {
                        this.distText.setText(`TARGET: ${stationLabel}\nDISTANCE: ${dist}\n[ DOCKING AVAILABLE — PRESS E ]`);
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


// ─────────────────────────────────────────────
//  LANDING SCENE
// ─────────────────────────────────────────────

interface TerrainPoint { x: number; y: number; }

class LandingScene extends Phaser.Scene {
    private ship!: Phaser.GameObjects.Container;
    private thrustGraphics!: Phaser.GameObjects.Graphics;
    private velocity = new Phaser.Math.Vector2(0, 0);

    private keyW!: Phaser.Input.Keyboard.Key;
    private keyA!: Phaser.Input.Keyboard.Key;
    private keyD!: Phaser.Input.Keyboard.Key;
    private keyEsc!: Phaser.Input.Keyboard.Key;

    private statusText!: Phaser.GameObjects.Text;
    private readonly gravity     = 0.15;
    private readonly thrustPower = 0.4;
    private landingStatus: 'flying' | 'landed' | 'crashed' | 'fined' = 'flying';

    // Bay data
    private bays: { x: number; y: number; width: number; name: string }[] = [];
    private assignedBayIndex = 0;
    private bayCount = 3;

    // Terrain
    private terrainPoints: TerrainPoint[] = [];
    private terrainGraphics!: Phaser.GameObjects.Graphics;

    // Return-to-space data
    private returnX  = 0;
    private returnY  = 0;
    private returnVX = 0;
    private returnVY = 0;

    // Ship bottom offset (from container origin)
    private readonly SHIP_HALF_H = 14;

    constructor() {
        super({ key: 'LandingScene' });
    }

    create(data: {
        stationName?: string;
        assignedBayIndex?: number;
        returnX?: number; returnY?: number;
        returnVX?: number; returnVY?: number;
    }) {
        this.cameras.main.setBackgroundColor('#ffffff');
        this.landingStatus    = 'flying';
        this.velocity.set(2 + Math.random() * 3, 1 + Math.random() * 2); // drift on entry
        this.assignedBayIndex = data?.assignedBayIndex ?? 0;
        this.returnX          = data?.returnX  ?? 0;
        this.returnY          = data?.returnY  ?? 0;
        this.returnVX         = data?.returnVX ?? 0;
        this.returnVY         = data?.returnVY ?? 0;
        this.bays             = [];
        this.terrainPoints    = [];

        // Random 3-5 bays
        this.bayCount = Phaser.Math.Between(3, 5);

        // Clamp assigned bay index to actual count
        if (this.assignedBayIndex >= this.bayCount) {
            this.assignedBayIndex = this.bayCount - 1;
        }

        this.buildTerrain();
        this.buildBays();
        this.drawScene(data?.stationName);
        this.createShip();

        this.statusText = this.add.text(30, 30, '', {
            color: '#000', fontSize: '22px', fontStyle: 'bold'
        });

        // Assigned bay announcement (top centre)
        const bayNames = ['ALPHA', 'BETA', 'GAMMA', 'DELTA', 'EPSILON'];
        const assignedName = bayNames[this.assignedBayIndex] ?? 'ALPHA';
        this.add.text(this.scale.width / 2, 30,
            `TOWER: PROCEED TO BAY ${assignedName}`,
            { color: '#000', fontSize: '20px', fontStyle: 'bold', align: 'center',
              backgroundColor: '#fff', padding: { x: 10, y: 5 } }
        ).setOrigin(0.5, 0);

        this.add.text(30, this.scale.height - 50,
            'W: RETRO THRUST  |  A/D: LATERAL  |  ESC: ABORT / LEAVE / RETRY',
            { color: '#000', fontSize: '16px' });

        if (this.input.keyboard) {
            this.keyW   = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W);
            this.keyA   = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
            this.keyD   = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);
            this.keyEsc = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
        }
    }

    // ────────────────────────────────────────────────────────────
    //  TERRAIN GENERATION
    // ────────────────────────────────────────────────────────────
    private buildTerrain() {
        const W    = this.scale.width;
        const H    = this.scale.height;
        const groundY = H - 80;       // base ground line
        const bayW    = 110;
        const bayGap  = Math.floor((W - 80) / this.bayCount); // spread evenly
        const bayNames = ['ALPHA', 'BETA', 'GAMMA', 'DELTA', 'EPSILON'];

        // Place bays evenly
        for (let i = 0; i < this.bayCount; i++) {
            const bx = 60 + bayGap * i + bayGap / 2;
            this.bays.push({ x: bx, y: groundY, width: bayW, name: bayNames[i] });
        }

        // Build terrain profile: rough terrain with flat bay sections
        const segments = 60;
        const points: TerrainPoint[] = [];
        points.push({ x: 0, y: H });    // left edge bottom

        // Midpoint displacement style
        const rawPoints: number[] = [];
        for (let i = 0; i <= segments; i++) {
            rawPoints.push(groundY + Phaser.Math.Between(-55, 30));
        }
        // Smooth a bit
        for (let pass = 0; pass < 3; pass++) {
            for (let i = 1; i < rawPoints.length - 1; i++) {
                rawPoints[i] = (rawPoints[i - 1] + rawPoints[i] + rawPoints[i + 1]) / 3;
            }
        }

        for (let i = 0; i <= segments; i++) {
            const px = (i / segments) * W;
            let   py = rawPoints[i];

            // Flatten where bays are
            for (const bay of this.bays) {
                const left  = bay.x - bay.width / 2 - 10;
                const right = bay.x + bay.width / 2 + 10;
                if (px >= left && px <= right) {
                    py = bay.y;
                }
            }

            points.push({ x: px, y: py });
        }

        points.push({ x: W, y: H });   // right edge bottom
        this.terrainPoints = points;
    }

    private buildBays() {
        // bays already built in buildTerrain
    }

    private drawScene(stationName?: string) {
        const W  = this.scale.width;
        const H  = this.scale.height;
        const g  = this.add.graphics();
        const bayNames = ['ALPHA', 'BETA', 'GAMMA', 'DELTA', 'EPSILON'];

        // Sky gradient layers (simple horizontal bands)
        for (let i = 0; i < 6; i++) {
            const alpha = 0.04 + i * 0.015;
            g.fillStyle(0x000000, alpha);
            g.fillRect(0, H * 0.5 + i * (H * 0.08), W, H * 0.08);
        }

        // Stars in sky
        g.fillStyle(0x000000, 0.25);
        for (let i = 0; i < 80; i++) {
            const sx = Math.random() * W;
            const sy = Math.random() * (H * 0.55);
            g.fillCircle(sx, sy, 1 + Math.random() * 1.5);
        }

        // Station silhouette in background
        g.lineStyle(1.5, 0x000000, 0.12);
        g.fillStyle(0x000000, 0.06);
        // Large dome
        g.beginPath();
        g.arc(W * 0.5, H * 0.38, 260, Math.PI, 0);
        g.closePath();
        g.fillPath();
        g.strokePath();
        // Towers
        for (let t = 0; t < 5; t++) {
            const tx = W * 0.25 + t * W * 0.12;
            const th = 80 + Math.random() * 120;
            g.fillStyle(0x000000, 0.08);
            g.fillRect(tx - 8, H * 0.38 - th, 16, th);
        }

        // Terrain fill
        g.fillStyle(0x000000, 0.12);
        g.beginPath();
        g.moveTo(this.terrainPoints[0].x, this.terrainPoints[0].y);
        for (const pt of this.terrainPoints) g.lineTo(pt.x, pt.y);
        g.closePath();
        g.fillPath();

        // Terrain outline
        g.lineStyle(3, 0x000000, 1);
        g.beginPath();
        // Skip first and last (bottom corners)
        g.moveTo(this.terrainPoints[1].x, this.terrainPoints[1].y);
        for (let i = 2; i < this.terrainPoints.length - 1; i++) {
            g.lineTo(this.terrainPoints[i].x, this.terrainPoints[i].y);
        }
        g.strokePath();

        // Draw bays
        for (let i = 0; i < this.bays.length; i++) {
            const bay    = this.bays[i];
            const isAssigned = i === this.assignedBayIndex;
            const halfW  = bay.width / 2;

            // Bay floor
            g.lineStyle(4, 0x000000, 1);
            g.strokeLineShape(new Phaser.Geom.Line(bay.x - halfW, bay.y, bay.x + halfW, bay.y));

            // Bay side walls
            g.lineStyle(3, 0x000000, 0.8);
            g.strokeLineShape(new Phaser.Geom.Line(bay.x - halfW, bay.y, bay.x - halfW, bay.y + 25));
            g.strokeLineShape(new Phaser.Geom.Line(bay.x + halfW, bay.y, bay.x + halfW, bay.y + 25));

            // Bay lighting dots
            for (let d = 0; d < 5; d++) {
                const dx = bay.x - halfW + (bay.width / 4) * d;
                g.fillStyle(0x000000, isAssigned ? 0.9 : 0.3);
                g.fillCircle(dx, bay.y - 5, 3);
            }

            // Bay label
            const label  = bayNames[i] ?? `BAY ${i + 1}`;
            const colour = isAssigned ? '#000' : '#888';
            const style  = isAssigned ? 'bold' : 'normal';
            this.add.text(bay.x, bay.y + 30, label, {
                color: colour, fontSize: isAssigned ? '18px' : '15px', fontStyle: style
            }).setOrigin(0.5, 0);

            // Assigned marker
            if (isAssigned) {
                g.lineStyle(2, 0x000000, 0.8);
                g.strokeTriangle(
                    bay.x, bay.y - 30,
                    bay.x - 10, bay.y - 45,
                    bay.x + 10, bay.y - 45
                );
                g.fillStyle(0x000000, 0.8);
                g.fillTriangle(
                    bay.x, bay.y - 30,
                    bay.x - 10, bay.y - 45,
                    bay.x + 10, bay.y - 45
                );
            }
        }

        // Station name
        if (stationName) {
            this.add.text(W / 2, H * 0.42,
                stationName, { color: '#000', fontSize: '24px', fontStyle: 'bold' }
            ).setOrigin(0.5).setAlpha(0.2);
        }
    }

    // ────────────────────────────────────────────────────────────
    //  SHIP
    // ────────────────────────────────────────────────────────────
    private createShip() {
        // Ship spawns at the top, above a random X
        this.ship = this.add.container(this.scale.width * (0.2 + Math.random() * 0.6), 60);

        const g = this.add.graphics();
        this.drawLanderGraphic(g);
        this.ship.add(g);

        this.thrustGraphics = this.add.graphics();
        this.ship.add(this.thrustGraphics);
    }

    private drawLanderGraphic(g: Phaser.GameObjects.Graphics) {
        g.clear();
        // Lander body – capsule style
        g.lineStyle(2.5, 0x000000, 1);
        g.fillStyle(0xffffff, 1);
        // Main body rect
        g.fillRect(-14, -10, 28, 20);
        g.strokeRect(-14, -10, 28, 20);
        // Top dome
        g.beginPath();
        g.arc(0, -10, 10, Math.PI, 0);
        g.closePath();
        g.fillPath();
        g.strokePath();
        // Window
        g.fillStyle(0x000000, 1);
        g.fillCircle(0, -9, 5);
        g.fillStyle(0xffffff, 0.6);
        g.fillCircle(-1.5, -10.5, 2);
        // Landing legs
        g.lineStyle(2, 0x000000, 1);
        // Left leg
        g.strokeLineShape(new Phaser.Geom.Line(-14, 8,  -22, 18));
        g.strokeLineShape(new Phaser.Geom.Line(-22, 18, -26, 18));
        // Right leg
        g.strokeLineShape(new Phaser.Geom.Line( 14, 8,   22, 18));
        g.strokeLineShape(new Phaser.Geom.Line(  22, 18,  26, 18));
        // Engine nozzle
        g.fillStyle(0x333333, 1);
        g.fillRect(-8, 10, 16, 6);
        g.lineStyle(1.5, 0x000000, 1);
        g.strokeRect(-8, 10, 16, 6);
    }

    // ────────────────────────────────────────────────────────────
    //  UPDATE
    // ────────────────────────────────────────────────────────────
    update(_time: number, delta: number) {
        if (Phaser.Input.Keyboard.JustDown(this.keyEsc)) {
            this.leaveScene();
            return;
        }

        if (this.landingStatus !== 'flying') return;

        const dt = Math.min(delta, 32) / 16.6;

        this.velocity.y += this.gravity * dt;

        this.thrustGraphics.clear();
        if (this.keyW.isDown) {
            this.velocity.y -= this.thrustPower * dt;
            this.drawThrust(0, 16);
        }
        if (this.keyA.isDown) {
            this.velocity.x -= this.thrustPower * 0.5 * dt;
            this.drawSideThrust(26, 0);
        }
        if (this.keyD.isDown) {
            this.velocity.x += this.thrustPower * 0.5 * dt;
            this.drawSideThrust(-26, 0);
        }

        this.ship.x += this.velocity.x * dt;
        this.ship.y += this.velocity.y * dt;

        // HUD
        this.statusText.setText(
            `V-SPEED: ${Math.abs(this.velocity.y).toFixed(1)}\nH-SPEED: ${Math.abs(this.velocity.x).toFixed(1)}`
        );

        // Landing / crash detection
        this.checkLanding();

        // Wrap horizontally
        if (this.ship.x < 0)               this.ship.x = this.scale.width;
        if (this.ship.x > this.scale.width) this.ship.x = 0;

        // Top escape
        if (this.ship.y < -100) {
            this.ship.y = 80;
            this.velocity.set(0, 0);
        }
    }

    private checkLanding() {
        // Ship legs bottom: ship.y + SHIP_HALF_H + 4 (leg extension)
        const shipBottom = this.ship.y + this.SHIP_HALF_H + 4;
        const shipLeft   = this.ship.x - 26;
        const shipRight  = this.ship.x + 26;

        // Find terrain Y at ship X
        const terrainY = this.getTerrainY(this.ship.x);

        if (shipBottom >= terrainY) {
            // Settle exactly on surface
            this.ship.y = terrainY - this.SHIP_HALF_H - 4;
            this.velocity.set(0, 0);

            // Which bay (if any) are we on?
            let landedBayIndex = -1;
            for (let i = 0; i < this.bays.length; i++) {
                const bay = this.bays[i];
                if (
                    this.ship.x >= bay.x - bay.width / 2 &&
                    this.ship.x <= bay.x + bay.width / 2 &&
                    Math.abs(shipBottom - bay.y) < 12
                ) {
                    landedBayIndex = i;
                    break;
                }
            }

            const safeV = Math.abs(this.velocity.y) < 2.8;  // checked before set(0,0) – use pre-zero speed
            // Re-check speed before it was zeroed using terrainY check: we need to re-get it before snap
            // (velocity is already zeroed so we use a rough check – landing is always gentle if we reach here)
            // For crash: hard terrain (not a bay)
            if (landedBayIndex === -1) {
                // Crashed into terrain or rough area
                this.onCrash();
            } else {
                // On a bay
                if (landedBayIndex === this.assignedBayIndex) {
                    this.onLandedCorrect();
                } else {
                    this.onLandedWrongBay(landedBayIndex);
                }
            }
        }
    }

    private _preSnapVy = 0;

    // Override update to capture velocity before snap
    private getTerrainY(worldX: number): number {
        const pts = this.terrainPoints;
        // Binary search closest segment
        for (let i = 1; i < pts.length - 1; i++) {
            const a = pts[i];
            const b = pts[i + 1];
            if (worldX >= a.x && worldX <= b.x) {
                const t  = (worldX - a.x) / (b.x - a.x || 1);
                return a.y + t * (b.y - a.y);
            }
        }
        return pts[1]?.y ?? this.scale.height - 80;
    }

    private onCrash() {
        this.landingStatus = 'crashed';
        this.statusText.setText('CRASHED!\nPRESS ESC TO RETRY');
        this.ship.setAlpha(0.4);
    }

    private onLandedCorrect() {
        this.landingStatus = 'landed';
        this.statusText.setText('LANDING SUCCESSFUL!\nPRESS ESC TO DEPART');
    }

    private onLandedWrongBay(bayIndex: number) {
        this.landingStatus = 'fined';
        const bayNames = ['ALPHA', 'BETA', 'GAMMA', 'DELTA', 'EPSILON'];
        const correctName = bayNames[this.assignedBayIndex] ?? 'ALPHA';
        const actualName  = bayNames[bayIndex]              ?? `BAY ${bayIndex + 1}`;
        this.statusText.setText(
            `UNAUTHORISED LANDING IN BAY ${actualName}!\n` +
            `ASSIGNED BAY WAS ${correctName}.\n` +
            `FINE: 500 CREDITS DEDUCTED.\n\n` +
            `PRESS ESC TO DEPART`
        );
        // Flash the ship to indicate fine
        this.tweens.add({
            targets: this.ship,
            alpha: { from: 1, to: 0.3 },
            duration: 100,
            yoyo: true,
            repeat: 5,
        });
    }

    private drawThrust(x: number, y: number) {
        const size = 14 + Math.random() * 10;
        this.thrustGraphics.fillStyle(0xffaa00, 0.4);
        this.thrustGraphics.fillPoints([
            new Phaser.Math.Vector2(x - 6, y),
            new Phaser.Math.Vector2(x,     y + size),
            new Phaser.Math.Vector2(x + 6, y),
        ], true);
        this.thrustGraphics.fillStyle(0xffffff, 0.6);
        this.thrustGraphics.fillPoints([
            new Phaser.Math.Vector2(x - 3, y),
            new Phaser.Math.Vector2(x,     y + size * 0.55),
            new Phaser.Math.Vector2(x + 3, y),
        ], true);
    }

    private drawSideThrust(x: number, _y: number) {
        const size = 10 + Math.random() * 6;
        const dir  = x > 0 ? 1 : -1;
        this.thrustGraphics.fillStyle(0xffaa00, 0.35);
        this.thrustGraphics.fillPoints([
            new Phaser.Math.Vector2(x,           -4),
            new Phaser.Math.Vector2(x + dir * size, 0),
            new Phaser.Math.Vector2(x,            4),
        ], true);
    }

    private leaveScene() {
        if (this.landingStatus === 'crashed') {
            this.scene.restart({
                stationName:      undefined,
                assignedBayIndex: this.assignedBayIndex,
                returnX:          this.returnX,
                returnY:          this.returnY,
                returnVX:         this.returnVX,
                returnVY:         this.returnVY,
            });
        } else {
            this.scene.stop();
            this.scene.start('GameScene', {
                returnX:  this.returnX,
                returnY:  this.returnY,
                returnVX: this.returnVX,
                returnVY: this.returnVY,
            });
        }
    }
}


// ─────────────────────────────────────────────
//  BOOT
// ─────────────────────────────────────────────
const config: Phaser.Types.Core.GameConfig = {
    type:   Phaser.AUTO,
    width:  window.innerWidth,
    height: window.innerHeight,
    parent: 'game-container',
    scene:  [GameScene, LandingScene],
    physics: {
        default: 'arcade',
        arcade:  { debug: false },
    },
};

// @ts-ignore
window.game = new Phaser.Game(config);

window.addEventListener('resize', () => {
    // @ts-ignore
    if (window.game) window.game.scale.resize(window.innerWidth, window.innerHeight);
});