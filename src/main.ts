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

    // UI
    private uiCamera!: Phaser.Cameras.Scene2D.Camera;
    private speedText!: Phaser.GameObjects.Text;
    private distText!: Phaser.GameObjects.Text;
    private hintText!: Phaser.GameObjects.Text;
    private commText!: Phaser.GameObjects.Text;
    private pointerDistText!: Phaser.GameObjects.Text;
    private navArrow!: Phaser.GameObjects.Graphics;   // world-space arrow around ship
    private moveArrow!: Phaser.GameObjects.Graphics;  // screen-space instrument

    private stations: Phaser.GameObjects.Container[] = [];
    private targetStation?: Phaser.GameObjects.Container;
    private targetIndex = 0;
    private canEnterStation = false;

    // Comms
    private commStatus: 'none' | 'calling' | 'identifying' | 'scanning' | 'granted' = 'none';
    private commTimer = 0;

    constructor() {
        super({ key: 'GameScene' });
    }

    create() {
        this.cameras.main.setBackgroundColor('#ffffff');
        this.physics.world.setBounds(-WORLD_SIZE, -WORLD_SIZE, WORLD_SIZE * 2, WORLD_SIZE * 2);

        // Reset state (important when scene is restarted/returned to)
        this.velocity.set(0, 0);
        this.throttle = 0;
        this.commStatus = 'none';
        this.commTimer = 0;
        this.stations = [];
        this.stars = [];

        this.createStars();
        this.createStations(20);
        this.createShip();

        this.cameras.main.startFollow(this.ship, true, 1, 1);

        // ── UI camera (fixed, no scroll) ──────────────────────────────
        this.uiCamera = this.cameras.add(0, 0, this.scale.width, this.scale.height)
            .setScroll(0, 0)
            .setName('UI');

        // Text & screen-space graphics – rendered by uiCamera only
        this.speedText       = this.add.text(30, 30, '', { color: '#000', fontSize: '24px', fontStyle: 'bold' });
        this.distText        = this.add.text(30, 90, '', { color: '#000', fontSize: '20px' });
        this.commText        = this.add.text(this.scale.width / 2, this.scale.height - 120, '', {
            color: '#000', fontSize: '18px', fontStyle: 'bold',
            align: 'center', backgroundColor: '#fff', padding: { x: 10, y: 5 }
        }).setOrigin(0.5);
        this.hintText        = this.add.text(30, this.scale.height - 50,
            'W/S: THROTTLE  |  X: BRAKE  |  MOUSE: AIM  |  N: NEXT TARGET  |  C: COMMS',
            { color: '#000', fontSize: '16px' });
        this.pointerDistText = this.add.text(0, 0, '', {
            color: '#000', fontSize: '14px', backgroundColor: 'rgba(255,255,255,0.7)',
            padding: { x: 4, y: 2 }
        }).setOrigin(0.5, -0.2);

        // navArrow lives in WORLD space (drawn via main camera)
        this.navArrow  = this.add.graphics().setDepth(10);
        // moveArrow & pointerDistText live in SCREEN space (uiCamera)
        this.moveArrow = this.add.graphics().setDepth(11);

        // Main camera sees: ship, stations, navArrow  →  ignore UI objects
        const uiObjects = [
            this.speedText, this.distText, this.hintText,
            this.commText, this.pointerDistText, this.moveArrow,
            ...this.stars.map(s => s.sprite)
        ];
        this.cameras.main.ignore(uiObjects);

        // uiCamera sees: stars, all UI text/graphics  →  ignore world objects
        const worldObjects: Phaser.GameObjects.GameObject[] = [
            this.ship, this.navArrow,
            ...this.stations,
        ];
        this.uiCamera.ignore(worldObjects);

        // Register keys
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
    }

    // ────────────────────────────────────────────
    private createStars() {
        const layers = 5;
        const baseScrollFactor = 0.00002;
        const textureSize = 1024;

        for (let i = 0; i < layers; i++) {
            const textureKey = `stars_layer_${i}`;
            // Destroy existing texture if scene was restarted
            if (this.textures.exists(textureKey)) this.textures.remove(textureKey);

            const graphics = this.make.graphics({ x: 0, y: 0 });
            const factor = baseScrollFactor * Math.pow(2.5, i);
            const alpha  = 0.1 + i * 0.05;
            const radius = 1.0 + i * 0.8;
            const count  = 8  + i * 4;

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
        this.targetIndex  = 0;
        this.targetStation = this.stations[0];
    }

    private createShip() {
        this.ship = this.add.container(0, 0);

        this.thrustGraphics = this.add.graphics();
        this.ship.add(this.thrustGraphics);

        this.shipGraphics = this.add.graphics();
        this.shipGraphics.lineStyle(3, 0x000000);
        const pts = [
            new Phaser.Math.Vector2(SHIP_SIZE * 1.5, 0),
            new Phaser.Math.Vector2(-SHIP_SIZE,  SHIP_SIZE),
            new Phaser.Math.Vector2(-SHIP_SIZE, -SHIP_SIZE),
        ];
        this.shipGraphics.strokePoints(pts, true);
        this.ship.add(this.shipGraphics);
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
            const size = SHIP_SIZE * (0.8 + Math.random() * 0.4) * this.throttle;

            this.thrustGraphics.lineStyle(2, 0xffaa00, 0.5);
            this.thrustGraphics.fillStyle(0xffaa00, 0.3);
            this.thrustGraphics.fillPoints([
                new Phaser.Math.Vector2(-SHIP_SIZE,  SHIP_SIZE * 0.7),
                new Phaser.Math.Vector2(-SHIP_SIZE - size * 2.5, 0),
                new Phaser.Math.Vector2(-SHIP_SIZE, -SHIP_SIZE * 0.7),
            ], true);

            this.thrustGraphics.fillStyle(0xffffff, 0.6);
            this.thrustGraphics.fillPoints([
                new Phaser.Math.Vector2(-SHIP_SIZE,  SHIP_SIZE * 0.4),
                new Phaser.Math.Vector2(-SHIP_SIZE - size * 1.2, 0),
                new Phaser.Math.Vector2(-SHIP_SIZE, -SHIP_SIZE * 0.4),
            ], true);
        }
    }

    private handleInput(dt: number) {
        // ── Rotation towards mouse ──────────────────────────────────
        const mouseWorld = this.cameras.main.getWorldPoint(this.input.x, this.input.y);
        const targetAngle = Phaser.Math.Angle.Between(
            this.ship.x, this.ship.y, mouseWorld.x, mouseWorld.y
        );
        const speed = this.velocity.length();
        const rotSpeed = Math.max(0.01, 0.15 / (1 + speed / 500));
        this.ship.rotation = Phaser.Math.Angle.RotateTo(this.ship.rotation, targetAngle, rotSpeed * dt);

        // ── Throttle ────────────────────────────────────────────────
        if (this.keyW.isDown) {
            this.throttle = Math.min(this.throttle + 0.015 * dt, 1);
        } else if (this.keyS.isDown) {
            this.throttle = Math.max(this.throttle - 0.015 * dt, -1);
        } else if (Phaser.Input.Keyboard.JustDown(this.keyX)) {
            // Instant 5 % brake pulse (capped to avoid big negative jumps)
            this.throttle = -0.05;
        } else if (!this.keyW.isDown && !this.keyS.isDown) {
            // Throttle drifts back to 0 when no key is held
            this.throttle = Phaser.Math.Linear(this.throttle, 0, 0.08 * dt);
            if (Math.abs(this.throttle) < 0.001) this.throttle = 0;
        }

        // ── Next target ─────────────────────────────────────────────
        if (Phaser.Input.Keyboard.JustDown(this.keyN)) {
            this.targetIndex   = (this.targetIndex + 1) % this.stations.length;
            this.targetStation = this.stations[this.targetIndex];
            this.commStatus    = 'none';
        }

        // ── Comms ───────────────────────────────────────────────────
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
                }
            }
        } else {
            // Reset comms when out of range
            if (this.commStatus !== 'granted') this.commStatus = 'none';
        }

        // ── Enter station ────────────────────────────────────────────
        if (this.canEnterStation && Phaser.Input.Keyboard.JustDown(this.keyE)) {
            this.scene.start('LandingScene', { stationName: (this.targetStation!.list[1] as Phaser.GameObjects.Text).text });
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
                this.throttle = 0; // BUG FIX: clear throttle once fully stopped
            }
        }

        // Hard cap
        if (this.velocity.length() > 1000000) this.velocity.setLength(1000000);

        // Micro drag
        this.velocity.scale(1 - 0.001 * dt);

        this.ship.x += this.velocity.x * dt;
        this.ship.y += this.velocity.y * dt;
    }

    private updateCamera(dt: number) {
        const speed      = this.velocity.length();
        const targetZoom = Math.max(1.0 / (1 + speed / 250), 0.01);
        this.cameras.main.setZoom(Phaser.Math.Linear(this.cameras.main.zoom, targetZoom, 0.05 * dt));

        const zoom = this.cameras.main.zoom;
        const minVisualSize = 15;
        this.ship.setScale(Math.max(1, minVisualSize / (SHIP_SIZE * zoom)));

        // Parallax star scrolling
        const cam = this.cameras.main;
        this.stars.forEach(layer => {
            layer.sprite.setTilePosition(cam.scrollX * layer.factor, cam.scrollY * layer.factor);
            layer.sprite.setSize(this.scale.width, this.scale.height);
        });

        this.uiCamera.setSize(this.scale.width, this.scale.height);
    }

    private updateUI() {
        const speed         = Math.round(this.velocity.length());
        const throttlePercent = Math.round(this.throttle * 100);
        const throttleLabel   = throttlePercent < 0
            ? `[ BRAKE: ${Math.abs(throttlePercent)}% ]`
            : `THROTTLE: ${throttlePercent}%`;
        this.speedText.setText(`SPEED: ${speed}\n${throttleLabel}`);

        // ── Movement direction instrument (top-right, screen space) ──
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

        // ── Nav arrow (world space, drawn around ship) ────────────────
        this.navArrow.clear();
        this.canEnterStation = false;
        this.commText.setText('');

        if (this.targetStation) {
            const dist = Math.round(Phaser.Math.Distance.Between(
                this.ship.x, this.ship.y, this.targetStation.x, this.targetStation.y
            ));
            const stationLabel = (this.targetStation.list[1] as Phaser.GameObjects.Text).text;
            this.distText.setText(`TARGET: ${stationLabel}\nDISTANCE: ${dist}`);

            const angle      = Phaser.Math.Angle.Between(this.ship.x, this.ship.y, this.targetStation.x, this.targetStation.y);
            const zoom       = this.cameras.main.zoom;
            // Arrow drawn in world coords at a fixed screen-radius around ship
            const screenR    = 120;
            const worldR     = screenR / zoom;
            const arrowX     = this.ship.x + Math.cos(angle) * worldR;
            const arrowY     = this.ship.y + Math.sin(angle) * worldR;
            const arrowSize  = 12 / zoom;

            this.navArrow.lineStyle(3 / zoom, 0x000000, 0.8);
            this.navArrow.strokeTriangle(
                arrowX + Math.cos(angle)       * arrowSize * 1.5, arrowY + Math.sin(angle)       * arrowSize * 1.5,
                arrowX + Math.cos(angle + 2.5) * arrowSize,       arrowY + Math.sin(angle + 2.5) * arrowSize,
                arrowX + Math.cos(angle - 2.5) * arrowSize,       arrowY + Math.sin(angle - 2.5) * arrowSize,
            );

            // Distance label next to arrow (screen space)
            const screenX = this.scale.width  / 2 + Math.cos(angle) * screenR;
            const screenY = this.scale.height / 2 + Math.sin(angle) * screenR;
            this.pointerDistText.setPosition(screenX, screenY).setText(`${dist}`);

            // ── Comms state machine ─────────────────────────────────
            if (dist < 2000) {
                if (this.commStatus === 'none') {
                    this.commText.setText('[ COMM LINK AVAILABLE — PRESS C ]');
                } else if (this.commStatus === 'calling') {
                    // FIX: timer only decrements once per frame here (was also being decremented in handleInput)
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
                    this.commText.setText('TOWER: SCAN COMPLETE. CLEARANCE GRANTED.\nPROCEED TO LANDING BAY.');
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
    private landingStatus: 'flying' | 'landed' | 'crashed' = 'flying';

    // Landing bay dims (computed in create, reused in update)
    private bayX = 0;
    private bayY = 0;
    private readonly bayWidth  = 300;
    private readonly bayHeight = 20;

    constructor() {
        super({ key: 'LandingScene' });
    }

    create(data: { stationName?: string }) {
        this.cameras.main.setBackgroundColor('#ffffff');
        this.landingStatus = 'flying';
        this.velocity.set(0, 0);

        this.bayX = this.scale.width  / 2;
        this.bayY = this.scale.height - 100;

        // Landing bay
        const bay = this.add.graphics();
        bay.lineStyle(4, 0x000000);
        bay.strokeRect(this.bayX - this.bayWidth / 2, this.bayY, this.bayWidth, this.bayHeight);
        bay.fillStyle(0x000000, 0.05);
        bay.fillRect(this.bayX - this.bayWidth / 2, this.bayY, this.bayWidth, this.bayHeight);
        this.add.text(this.bayX, this.bayY + 40, data?.stationName ?? 'LANDING BAY', {
            color: '#000', fontSize: '20px', fontStyle: 'bold'
        }).setOrigin(0.5);

        // Ship (lander silhouette)
        this.ship = this.add.container(this.scale.width / 2, 100);
        const shipG = this.add.graphics();
        shipG.lineStyle(3, 0x000000);
        shipG.strokeRect(-20, -10, 40, 20);
        shipG.strokeRect(-25, 10, 10, 10);
        shipG.strokeRect(15,  10, 10, 10);
        this.ship.add(shipG);

        this.thrustGraphics = this.add.graphics();
        this.ship.add(this.thrustGraphics);

        this.statusText = this.add.text(30, 30, '', { color: '#000', fontSize: '24px', fontStyle: 'bold' });
        this.add.text(30, this.scale.height - 50,
            'W: RETRO THRUST  |  A/D: LATERAL  |  ESC: ABORT / LEAVE / RETRY',
            { color: '#000', fontSize: '16px' });

        if (this.input.keyboard) {
            this.keyW   = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W);
            this.keyA   = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
            this.keyD   = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);
            // BUG FIX: was trying to add keyS but keyS is unused — removed to prevent ghost key conflicts
            this.keyEsc = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
        }
    }

    update(_time: number, delta: number) {
        // ── ESC must always be checked, regardless of landing state ──
        if (Phaser.Input.Keyboard.JustDown(this.keyEsc)) {
            if (this.landingStatus === 'crashed') {
                // Retry – restart landing scene fresh
                this.scene.restart();
            } else {
                // 'flying' → abort   |  'landed' → depart
                // BUG FIX: was 'GameScene' string but scene key must match exactly;
                // also calling scene.stop() first ensures clean teardown
                this.scene.stop();
                this.scene.start('GameScene');
            }
            return;
        }

        if (this.landingStatus !== 'flying') return;

        const dt = Math.min(delta, 32) / 16.6;

        // Gravity
        this.velocity.y += this.gravity * dt;

        // Thrusters
        this.thrustGraphics.clear();
        if (this.keyW.isDown) {
            this.velocity.y -= this.thrustPower * dt;
            this.drawThrust(0, 20, 0);
        }
        if (this.keyA.isDown) {
            this.velocity.x -= this.thrustPower * 0.5 * dt;
            this.drawThrust(20, 0, -Math.PI / 2);
        }
        if (this.keyD.isDown) {
            this.velocity.x += this.thrustPower * 0.5 * dt;
            this.drawThrust(-20, 0, Math.PI / 2);
        }

        this.ship.x += this.velocity.x * dt;
        this.ship.y += this.velocity.y * dt;

        // HUD
        this.statusText.setText(
            `V-SPEED: ${Math.abs(this.velocity.y).toFixed(1)}\nH-SPEED: ${Math.abs(this.velocity.x).toFixed(1)}`
        );

        // ── Landing / crash detection ──────────────────────────────
        const shipBottom = this.ship.y + 20;
        if (shipBottom >= this.bayY) {
            this.ship.y = this.bayY - 20;

            const onBay    = Math.abs(this.ship.x - this.bayX) < this.bayWidth / 2;
            const safeV    = Math.abs(this.velocity.y) < 2.5;
            const safeH    = Math.abs(this.velocity.x) < 1.5;

            if (onBay && safeV && safeH) {
                this.landingStatus = 'landed';
                this.statusText.setText('LANDING SUCCESSFUL!\nPRESS ESC TO DEPART');
            } else {
                this.landingStatus = 'crashed';
                this.statusText.setText('CRASHED!\nPRESS ESC TO RETRY');
                this.ship.setAlpha(0.5);
            }
            this.velocity.set(0, 0);
        }

        // Wrap horizontally
        if (this.ship.x < 0)                   this.ship.x = this.scale.width;
        if (this.ship.x > this.scale.width)     this.ship.x = 0;

        // Fell off the top – reset
        if (this.ship.y < -100) {
            this.ship.y = 100;
            this.velocity.set(0, 0);
        }
    }

    private drawThrust(x: number, y: number, _angle: number) {
        const size = 15 + Math.random() * 10;
        this.thrustGraphics.lineStyle(2, 0xffaa00, 0.8);
        this.thrustGraphics.fillStyle(0xffaa00, 0.4);
        this.thrustGraphics.fillPoints([
            new Phaser.Math.Vector2(x - 5, y),
            new Phaser.Math.Vector2(x, y + size),
            new Phaser.Math.Vector2(x + 5, y),
        ], true);
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