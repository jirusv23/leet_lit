import Phaser from 'phaser';

// 1. Define your Scene as a Class
class GameScene extends Phaser.Scene {
    private logo!: Phaser.Types.Physics.Arcade.ImageWithDynamicBody;

    constructor() {
        super('GameScene');
    }

    preload() {
        this.load.setBaseURL('https://labs.phaser.io');
        this.load.image('logo', 'assets/sprites/phaser3-logo.png');
    }

    create() {
        // TypeScript knows exactly what 'logo' is now
        this.logo = this.physics.add.image(400, 100, 'logo');
        this.logo.setVelocity(100, 200);
        this.logo.setBounce(1, 1);
        this.logo.setCollideWorldBounds(true);
    }

    update() {
        // Example: Rotating the logo every frame
        this.logo.rotation += 0.01;
    }
}

// 2. Game Configuration
const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    width: 800,
    height: 600,
    parent: 'game-container',
    physics: {
        default: 'arcade',
        arcade: { gravity: { x: 0, y: 300 } }
    },
    scene: GameScene // Pass the class here
};

new Phaser.Game(config);