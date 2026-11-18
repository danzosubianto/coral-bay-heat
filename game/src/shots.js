// shots.js — staged scenes for the entry's screenshots, reached with
// ?shot=<name>&seed=<n>. Each scene poses the real game (same systems, same
// HUD) at a photogenic moment; nothing here draws anything the game doesn't.

import { Car } from './vehicles.js';
import { PALETTE } from './config.js';

export function setupShot(game, name) {
  game.time = 6;
  if (name === 'menu') {
    game.state = 'title';
    game.camera.x = 1760;
    game.camera.y = 1560;
    return;
  }
  const { city } = game;
  game.cash = 640;
  game.respect = 6;
  game.missions.completed = 3;

  if (name === 'drive') {
    // Golden-hour cruise on the south avenue with the first job on the clock.
    const car = game.cars.find((c) => !c.dead) ?? game.cars[0];
    car.x = 1150; car.y = 2100 + 23; car.angle = 0;
    car.vx = 265; car.vy = 0;
    game.player.enterCar(car);
    game.autoDrive = { angle: 0 }; // hold the eastbound avenue lane
    game.missions.startNext(); // FIRST WHEELS: deliver this car to the garage
    snapCamera(game);
    return;
  }

  if (name === 'chase') {
    // Four stars on the downtown grid, cruisers closing from three sides.
    const car = game.cars.find((c) => !c.dead && c.kind !== 'taxi') ?? game.cars[0];
    car.x = 1820; car.y = 1260 + 23; car.angle = 0;
    car.vx = 300; car.vy = 0;
    car.health = 58;
    game.player.enterCar(car);
    game.autoDrive = true;
    game.wanted.heat = 3.4;
    const spots = [
      [1640, 1290, 0.12], [1560, 1210, -0.1], [1985, 1180, Math.PI - 0.4], [1730, 1420, -1.2],
    ];
    for (const [x, y, a] of spots) {
      const cop = new Car(x, y, a, PALETTE.copBody, 'cop');
      cop.vx = Math.cos(a) * 240; cop.vy = Math.sin(a) * 240;
      cop.stuckTime = 0;
      game.police.cruisers.push(cop);
    }
    game.missions.storyIndex = 1;
    game.missions.startNext(); // HOT PACKAGE on the HUD
    snapCamera(game);
    return;
  }

  if (name === 'mission') {
    // Cab Work: a fare waits at the curb, hand up, the taxi rolling in.
    game.missions.storyIndex = 3;
    game.missions.startNext(); // spawns the fare and the pickup objective
    const fare = game.missions.current?.farePed;
    const taxi = new Car(0, 0, 0, PALETTE.taxiBody, 'taxi');
    if (fare) {
      taxi.x = fare.x - 175; taxi.y = fare.y + 6;
      taxi.angle = 0; taxi.vx = 95;
      game.cars.push(taxi);
      game.player.enterCar(taxi);
      game.player.x = taxi.x; game.player.y = taxi.y;
    }
    snapCamera(game);
    return;
  }

  snapCamera(game);
}

function snapCamera(game) {
  const p = game.playerPos();
  game.camera.x = p.x;
  game.camera.y = p.y;
}
