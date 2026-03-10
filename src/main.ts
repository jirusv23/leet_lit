import Phaser from 'phaser';

const WORLD_SIZE = 10000000; // Large world for 1M speed
const SHIP_SIZE = 20;
const STATION_SIZE = 150;

class GameScene extends Phaser.Scene {
    private ship!: Phaser.GameObjects.Container;
    private shipGraphics!: Phaser.GameObjects.Graphics;
    private thrustGraphics!: Phaser.GameObjects.Graphics;
    private stars: { sprite: Phaser.GameObjects.TileSprite, factor: number }[] = [];
    private keyW!: Phaser.Input.Keyboard.Key;
    private keyS!: Phaser.Input.Keyboard.Key;
    private keyN!: Phaser.Input.Keyboard.Key;
    
    // Physics variables
    private velocity = new Phaser.Math.Vector2(0, 0);
    private throttle = 0; 
    private rotationInertia = 0.15;
    private baseAcceleration = 4;
    
    // UI Elements (Now managed by a separate camera)
    private uiCamera!: Phaser.Cameras.Scene2D.Camera;
    private speedText!: Phaser.GameObjects.Text;
    private distText!: Phaser.GameObjects.Text;
    private hintText!: Phaser.GameObjects.Text;
    private pointerDistText!: Phaser.GameObjects.Text;
    private navArrow!: Phaser.GameObjects.Graphics;
    
    private targetStation?: Phaser.GameObjects.Container;
    private stations: Phaser.GameObjects.Container[] = [];
    private targetIndex = 0;

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
        this.pointerDistText = this.add.text(0, 0, '', { color: '#000', fontSize: '14px', backgroundColor: 'rgba(255,255,255,0.5)' }).setOrigin(0.5, -1);
        
        this.navArrow = this.add.graphics().setDepth(10);

        this.cameras.main.ignore([this.speedText, this.distText, this.hintText, this.pointerDistText, ...this.stars.map(s => s.sprite)]);
        // UI camera now handles stars and UI text
        this.uiCamera.ignore([this.ship, this.navArrow, ...this.stations]);

        if (this.input.keyboard) {
            this.keyW = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W);
            this.keyS = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S);
            this.keyN = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.N);
        }
    }

    private createStars() {
        const layers = 5;
        // Extremely weak parallax for deep space
        const baseScrollFactor = 0.00002;
        const textureSize = 1024; // Larger tile for more randomness
        
        for (let i = 0; i < layers; i++) {
            const textureKey = `stars_layer_${i}`;
            const graphics = this.make.graphics({ x: 0, y: 0 });
            
            const factor = baseScrollFactor * Math.pow(2.5, i); 
            const alpha = 0.1 + (i * 0.05); 
            const radius = 1.0 + (i * 0.8); 
            const count = 8 + (i * 4); 

            graphics.fillStyle(0x000000, alpha);
            for (let j = 0; j < count; j++) {
                const x = Phaser.Math.Between(0, textureSize);
                const y = Phaser.Math.Between(0, textureSize);
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

    private createStations(count: number) {
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
                points.push(new Phaser.Math.Vector2(Math.cos(a) * r, Math.sin(a) * r));
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

    private createShip() {
        this.ship = this.add.container(0, 0);
        
        this.thrustGraphics = this.add.graphics();
        this.ship.add(this.thrustGraphics);

        this.shipGraphics = this.add.graphics();
        this.shipGraphics.lineStyle(3, 0x000000);
        
        const points = [
            new Phaser.Math.Vector2(SHIP_SIZE * 1.5, 0),
            new Phaser.Math.Vector2(-SHIP_SIZE, SHIP_SIZE),
            new Phaser.Math.Vector2(-SHIP_SIZE, -SHIP_SIZE)
        ];
        this.shipGraphics.strokePoints(points, true);
        this.ship.add(this.shipGraphics);
    }

    update(time: number, delta: number) {
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
            
            // Outer flame
            this.thrustGraphics.lineStyle(2, 0xffaa00, 0.5);
            this.thrustGraphics.fillStyle(0xffaa00, 0.3);
            const outerPoints = [
                new Phaser.Math.Vector2(-SHIP_SIZE, SHIP_SIZE * 0.7),
                new Phaser.Math.Vector2(-SHIP_SIZE - size * 2.5, 0),
                new Phaser.Math.Vector2(-SHIP_SIZE, -SHIP_SIZE * 0.7)
            ];
            this.thrustGraphics.fillPoints(outerPoints, true);
            this.thrustGraphics.strokePoints(outerPoints, true);

            // Inner flame
            this.thrustGraphics.fillStyle(0xffffff, 0.6);
            const innerPoints = [
                new Phaser.Math.Vector2(-SHIP_SIZE, SHIP_SIZE * 0.4),
                new Phaser.Math.Vector2(-SHIP_SIZE - size * 1.2, 0),
                new Phaser.Math.Vector2(-SHIP_SIZE, -SHIP_SIZE * 0.4)
            ];
            this.thrustGraphics.fillPoints(innerPoints, true);
        }
    }

    private handleInput(dt: number) {
        const mouseWorld = this.cameras.main.getWorldPoint(this.input.x, this.input.y);
        const targetAngle = Phaser.Math.Angle.Between(this.ship.x, this.ship.y, mouseWorld.x, mouseWorld.y);
        
        const speed = this.velocity.length();
        const effectiveRotationInertia = Math.max(0.01, 0.15 / (1 + speed / 500));

        this.ship.rotation = Phaser.Math.Angle.RotateTo(
            this.ship.rotation,
            targetAngle,
            effectiveRotationInertia * dt
        );

        if (this.keyW.isDown) {
            this.throttle = Math.min(this.throttle + 0.015 * dt, 1);
        } else if (this.keyS.isDown) {
            this.throttle = Math.max(this.throttle - 0.015 * dt, -1); 
        }

        if (Phaser.Input.Keyboard.JustDown(this.keyN)) {
            this.targetIndex = (this.targetIndex + 1) % this.stations.length;
            this.targetStation = this.stations[this.targetIndex];
        }
    }

    private applyPhysics(dt: number) {
        const currentSpeed = this.velocity.length();
        
        if (this.throttle > 0) {
            let thrustPower = this.baseAcceleration * (1 + currentSpeed / 200);
            
            // Soft cap at 900,000
            if (currentSpeed > 900000) {
                const softCapFactor = Math.max(0, 1 - (currentSpeed - 900000) / 100000);
                thrustPower *= (0.01 + softCapFactor * 0.99);
            }

            const thrustDir = new Phaser.Math.Vector2(Math.cos(this.ship.rotation), Math.sin(this.ship.rotation));
            const acceleration = thrustDir.scale(thrustPower * this.throttle * dt);
            this.velocity.add(acceleration);
        } else if (this.throttle < 0) {
            // Braking reduces current speed until it hits zero, then stops.
            // Increased braking force multiplier from 2.0 to 15.0 for much stronger deceleration.
            const brakeForce = this.baseAcceleration * 15.0 * Math.abs(this.throttle) * dt;
            if (currentSpeed > brakeForce) {
                this.velocity.setLength(currentSpeed - brakeForce);
            } else {
                this.velocity.set(0, 0);
            }
        }

        // Hard cap at 1,000,000
        if (this.velocity.length() > 1000000) {
            this.velocity.setLength(1000000);
        }

        this.velocity.scale(1 - (0.001 * dt));

        this.ship.x += this.velocity.x * dt;
        this.ship.y += this.velocity.y * dt;
    }

    private updateCamera(dt: number) {
        const speed = this.velocity.length();
        const targetZoom = Math.max(1.0 / (1 + speed / 350), 0.1);
        this.cameras.main.setZoom(Phaser.Math.Linear(this.cameras.main.zoom, targetZoom, 0.05 * dt));

        const zoom = this.cameras.main.zoom;
        // Ensure ship is always visible by scaling it up as we zoom out
        // Visual size = SHIP_SIZE * zoom * scale. 
        // We want visual size to be at least ~15px. 15 / (SHIP_SIZE * zoom)
        const minVisualSize = 15;
        this.ship.setScale(Math.max(1, minVisualSize / (SHIP_SIZE * zoom)));
        
        // Update stars tile position based on camera scroll
        const cam = this.cameras.main;
        this.stars.forEach(layer => {
            // stars are on uiCamera (scrollFactor 0), so we just update tilePosition for parallax
            layer.sprite.setTilePosition(cam.scrollX * layer.factor, cam.scrollY * layer.factor);
            layer.sprite.setSize(window.innerWidth, window.innerHeight);
        });

        this.uiCamera.setSize(window.innerWidth, window.innerHeight);
    }

    private updateUI() {
        const speed = Math.round(this.velocity.length());
        const throttlePercent = Math.round(this.throttle * 100);
        const throttleText = throttlePercent < 0 ? `[ BRAKE: ${Math.abs(throttlePercent)}% ]` : `THROTTLE: ${throttlePercent}%`;
        this.speedText.setText(`SPEED: ${speed}\n${throttleText}`);

        this.navArrow.clear();
        if (this.targetStation) {
            const dist = Math.round(Phaser.Math.Distance.Between(this.ship.x, this.ship.y, this.targetStation.x, this.targetStation.y));
            const stationLabel = this.targetStation.list[1] as Phaser.GameObjects.Text;
            this.distText.setText(`TARGET: ${stationLabel.text}\nDISTANCE: ${dist}`);
            
            const angle = Phaser.Math.Angle.Between(this.ship.x, this.ship.y, this.targetStation.x, this.targetStation.y);
            const zoom = this.cameras.main.zoom;
            
            const visualRadius = 120; 
            const arrowX = this.ship.x + Math.cos(angle) * (visualRadius / zoom);
            const arrowY = this.ship.y + Math.sin(angle) * (visualRadius / zoom);
            
            // Bind pointerDistText to navArrow (calculated in screen space)
            const screenX = window.innerWidth / 2 + Math.cos(angle) * visualRadius;
            const screenY = window.innerHeight / 2 + Math.sin(angle) * visualRadius;
            this.pointerDistText.setPosition(screenX, screenY);
            this.pointerDistText.setText(`${dist}`);

            const arrowSize = 12 / zoom;
            this.navArrow.lineStyle(3 / zoom, 0x000000, 0.8);
            this.navArrow.strokeTriangle(
                arrowX + Math.cos(angle) * arrowSize * 1.5, arrowY + Math.sin(angle) * arrowSize * 1.5,
                arrowX + Math.cos(angle + 2.5) * arrowSize, arrowY + Math.sin(angle + 2.5) * arrowSize,
                arrowX + Math.cos(angle - 2.5) * arrowSize, arrowY + Math.sin(angle - 2.5) * arrowSize
            );

            if (dist < 500 && speed < 60) {
                this.distText.setText(`TARGET: ${stationLabel.text}\nDISTANCE: ${dist}\n[ DOCKING AVAILABLE ]`);
            }
        } else {
            this.pointerDistText.setText('');
        }
        this.hintText.setY(window.innerHeight - 50);
    }
}

const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
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
    if (window.game) window.game.scale.resize(window.innerWidth, window.innerHeight);
});

// @ts-ignore
window.game = new Phaser.Game(config);
