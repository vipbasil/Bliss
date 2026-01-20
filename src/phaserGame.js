import Phaser from "phaser";
import { MapScene } from "./mapScene.js";
import { MatchGameScene } from "./matchGameScene.js";

export function createGame(parentId) {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent: parentId,
    width: 1024,
    height: 640,
    backgroundColor: "#0b0f17",
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [MapScene, MatchGameScene],
  });
}
