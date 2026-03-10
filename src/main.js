"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const phaser_1 = __importDefault(require("phaser"));
const WORLD_SIZE = 10000000; // Large world for 1M speed
const SHIP_SIZE = 20;
const STATION_SIZE = 150;
class GameScene extends phaser_1.default.Scene {
    ship;
    shipGraphics;
    stars = [];
    keyW;
    keyS;
    keyN;
    // Physics variables
    velocity = new phaser_1.default.Math.Vector2(0, 0);
    throttle = 0;
    rotationInertia = 0.15;
    baseAcceleration = 4;
    // UI Elements (Now managed by a separate camera)
    uiCamera;
    speedText;
    distText;
    hintText;
    navArrow;
    targetStation;
    stations = [];
    targetIndex = 0;
    constructor() {
        super('GameScene');
    }
    create() {
        this.cameras.main.setBackgroundColor('#ffffff');
        this.physics.world.setBounds(-WORLD_SIZE, -WORLD_SIZE, WORLD_SIZE * 2, WORLD_SIZE * 2);
        this.createStars();
        this.createStations(20);
        this.createShip();
        this.cameras.main.startFollow(this.ship, true, 1, 1);
        this.cameras.main.setFollowOffset(0, 0);
        this.uiCamera = this.cameras.add(0, 0, window.innerWidth, window.innerHeight).setScroll(0, 0).setName('UI');
        this.speedText = this.add.text(30, 30, '', { color: '#000', fontSize: '24px', fontStyle: 'bold' });
        this.distText = this.add.text(30, 90, '', { color: '#000', fontSize: '20px' });
        this.hintText = this.add.text(30, window.innerHeight - 50, 'W/S: THROTTLE | MOUSE: AIM | N: NEXT STATION', { color: '#000', fontSize: '16px' });
        this.navArrow = this.add.graphics().setDepth(10);
        this.cameras.main.ignore([this.speedText, this.distText, this.hintText]);
        this.uiCamera.ignore([this.ship, this.navArrow, ...this.stations, ...this.stars.map(s => s.sprite)]);
        if (this.input.keyboard) {
            this.keyW = this.input.keyboard.addKey(phaser_1.default.Input.Keyboard.KeyCodes.W);
            this.keyS = this.input.keyboard.addKey(phaser_1.default.Input.Keyboard.KeyCodes.S);
            this.keyN = this.input.keyboard.addKey(phaser_1.default.Input.Keyboard.KeyCodes.N);
        }
    }
    createStars() {
        const layers = 5;
        // Extremely weak parallax for deep space
        const baseScrollFactor = 0.002;
        const textureSize = 1024; // Larger tile for more randomness
        for (let i = 0; i < layers; i++) {
            const textureKey = `stars_layer_${i}`;
            const graphics = this.make.graphics({ x: 0, y: 0 });
            const factor = baseScrollFactor * Math.pow(2, i); // 0.002, 0.004, 0.008, 0.016, 0.032
            const alpha = 0.1 + (i * 0.05); // Slightly more opaque
            const radius = 1.0 + (i * 0.8); // Bigger stars
            const count = 5 + (i * 3); // Very few stars per tile
            graphics.fillStyle(0x000000, alpha);
            for (let j = 0; j < count; j++) {
                const x = phaser_1.default.Math.Between(0, textureSize);
                const y = phaser_1.default.Math.Between(0, textureSize);
                graphics.fillCircle(x, y, radius);
            }
            graphics.generateTexture(textureKey, textureSize, textureSize);
            graphics.destroy();
            const tileSprite = this.add.tileSprite(0, 0, window.innerWidth, window.innerHeight, textureKey)
                .setOrigin(0, 0)
                .setScrollFactor(0)
                .setDepth(-10 + i);
            this.stars.push({ sprite: tileSprite, factor });
        }
    }
    createStations(count) {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = 50000 + Math.random() * (WORLD_SIZE / 3);
            const x = Math.cos(angle) * dist;
            const y = Math.sin(angle) * dist;
            const station = this.add.container(x, y);
            const graphics = this.add.graphics();
            graphics.lineStyle(4, 0x000000);
            const points = [];
            const sides = 8;
            for (let s = 0; s < sides; s++) {
                const a = (s / sides) * Math.PI * 2;
                const r = s % 2 === 0 ? STATION_SIZE : STATION_SIZE * 0.8;
                points.push(new phaser_1.default.Math.Vector2(Math.cos(a) * r, Math.sin(a) * r));
            }
            graphics.strokePoints(points, true);
            station.add(graphics);
            const label = this.add.text(0, STATION_SIZE + 20, `SECTOR ${i + 1}`, { color: '#000', fontSize: '18px', fontStyle: 'bold' }).setOrigin(0.5);
            station.add(label);
            this.stations.push(station);
        }
        this.targetIndex = 0;
        this.targetStation = this.stations[this.targetIndex];
    }
    createShip() {
        this.ship = this.add.container(0, 0);
        this.shipGraphics = this.add.graphics();
        this.shipGraphics.lineStyle(3, 0x000000);
        const points = [
            new phaser_1.default.Math.Vector2(SHIP_SIZE * 1.5, 0),
            new phaser_1.default.Math.Vector2(-SHIP_SIZE, SHIP_SIZE),
            new phaser_1.default.Math.Vector2(-SHIP_SIZE, -SHIP_SIZE)
        ];
        this.shipGraphics.strokePoints(points, true);
        this.ship.add(this.shipGraphics);
    }
    update(time, delta) {
        const dt = Math.min(delta, 32) / 16.6;
        this.handleInput(dt);
        this.applyPhysics(dt);
        this.updateCamera(dt);
        this.updateUI();
    }
    handleInput(dt) {
        const mouseWorld = this.cameras.main.getWorldPoint(this.input.x, this.input.y);
        const targetAngle = phaser_1.default.Math.Angle.Between(this.ship.x, this.ship.y, mouseWorld.x, mouseWorld.y);
        const speed = this.velocity.length();
        const effectiveRotationInertia = Math.max(0.01, 0.15 / (1 + speed / 500));
        this.ship.rotation = phaser_1.default.Math.Angle.RotateTo(this.ship.rotation, targetAngle, effectiveRotationInertia * dt);
        if (this.keyW.isDown) {
            this.throttle = Math.min(this.throttle + 0.015 * dt, 1);
        }
        else if (this.keyS.isDown) {
            this.throttle = Math.max(this.throttle - 0.015 * dt, -0.2);
        }
        if (phaser_1.default.Input.Keyboard.JustDown(this.keyN)) {
            this.targetIndex = (this.targetIndex + 1) % this.stations.length;
            this.targetStation = this.stations[this.targetIndex];
        }
    }
    applyPhysics(dt) {
        const currentSpeed = this.velocity.length();
        let thrustPower = this.baseAcceleration;
        if (this.throttle > 0) {
            thrustPower *= (1 + currentSpeed / 200);
            // Soft cap at 900,000
            if (currentSpeed > 900000) {
                const softCapFactor = Math.max(0, 1 - (currentSpeed - 900000) / 100000);
                thrustPower *= (0.01 + softCapFactor * 0.99); // Slow down significantly but keep a tiny bit
            }
        }
        else if (this.throttle < 0) {
            thrustPower *= 0.6;
        }
        const accelerationMag = thrustPower * this.throttle;
        const thrustDir = new phaser_1.default.Math.Vector2(Math.cos(this.ship.rotation), Math.sin(this.ship.rotation));
        const acceleration = thrustDir.scale(accelerationMag * dt);
        this.velocity.add(acceleration);
        // Hard cap at 1,000,000
        if (this.velocity.length() > 1000000) {
            this.velocity.setLength(1000000);
        }
        this.velocity.scale(1 - (0.001 * dt));
        this.ship.x += this.velocity.x * dt;
        this.ship.y += this.velocity.y * dt;
    }
    updateCamera(dt) {
        const speed = this.velocity.length();
        const targetZoom = Math.max(1.0 / (1 + speed / 350), 0.05);
        this.cameras.main.setZoom(phaser_1.default.Math.Linear(this.cameras.main.zoom, targetZoom, 0.05 * dt));
        // Update stars tile position and size
        const cam = this.cameras.main;
        this.stars.forEach(layer => {
            layer.sprite.setTilePosition(cam.scrollX * layer.factor, cam.scrollY * layer.factor);
            layer.sprite.setSize(window.innerWidth / cam.zoom, window.innerHeight / cam.zoom);
            layer.sprite.setScale(1 / cam.zoom);
        });
        this.uiCamera.setSize(window.innerWidth, window.innerHeight);
    }
    updateUI() {
        const speed = Math.round(this.velocity.length());
        const throttlePercent = Math.round(this.throttle * 100);
        const throttleText = throttlePercent < 0 ? `[ BRAKE: ${Math.abs(throttlePercent)}% ]` : `THROTTLE: ${throttlePercent}%`;
        this.speedText.setText(`SPEED: ${speed}\n${throttleText}`);
        this.navArrow.clear();
        if (this.targetStation) {
            const dist = Math.round(phaser_1.default.Math.Distance.Between(this.ship.x, this.ship.y, this.targetStation.x, this.targetStation.y));
            const stationLabel = this.targetStation.list[1];
            this.distText.setText(`TARGET: ${stationLabel.text}\nDISTANCE: ${dist}`);
            const angle = phaser_1.default.Math.Angle.Between(this.ship.x, this.ship.y, this.targetStation.x, this.targetStation.y);
            const zoom = this.cameras.main.zoom;
            const visualRadius = 120;
            const arrowX = this.ship.x + Math.cos(angle) * (visualRadius / zoom);
            const arrowY = this.ship.y + Math.sin(angle) * (visualRadius / zoom);
            const arrowSize = 12 / zoom;
            this.navArrow.lineStyle(3 / zoom, 0x000000, 0.8);
            this.navArrow.strokeTriangle(arrowX + Math.cos(angle) * arrowSize * 1.5, arrowY + Math.sin(angle) * arrowSize * 1.5, arrowX + Math.cos(angle + 2.5) * arrowSize, arrowY + Math.sin(angle + 2.5) * arrowSize, arrowX + Math.cos(angle - 2.5) * arrowSize, arrowY + Math.sin(angle - 2.5) * arrowSize);
            if (dist < 500 && speed < 60) {
                this.distText.setText(`TARGET: ${stationLabel.text}\nDISTANCE: ${dist}\n[ DOCKING AVAILABLE ]`);
            }
        }
        this.hintText.setY(window.innerHeight - 50);
    }
}
const config = {
    type: phaser_1.default.AUTO,
    width: window.innerWidth,
    height: window.innerHeight,
    parent: 'game-container',
    scene: GameScene,
    physics: {
        default: 'arcade',
        arcade: { debug: false }
    }
};
window.addEventListener('resize', () => {
    // @ts-ignore
    if (window.game)
        window.game.scale.resize(window.innerWidth, window.innerHeight);
});
// @ts-ignore
window.game = new phaser_1.default.Game(config);
