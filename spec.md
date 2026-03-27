# Ustad Ji Game

## Current State
New project with empty backend and default frontend scaffolding.

## Requested Changes (Diff)

### Add
- Full 2D top-down shooter game rendered on HTML5 Canvas
- Start screen with "Ustad Ji" title and play button
- Large procedurally-placed map with terrain tiles, walls, trees, and cover objects
- Player character: WASD/arrow key movement, mouse aim, left-click shoot
- Three weapon types: Pistol (fast fire, low dmg), Rifle (medium fire, high dmg), Shotgun (slow fire, spread)
- Enemy AI: roam randomly, chase player on sight, shoot at player
- Health + armor system with visible HP bars above entities
- Weapon and ammo pickups scattered on map
- Shrinking blue zone (safe zone) that shrinks over time and deals damage outside it
- HUD: kill count, survival timer, current weapon/ammo, health/armor bars
- Minimap in corner: player dot, zone circle, enemy dots
- Game over screen with kills, time survived, restart button
- Mobile touch controls: virtual joystick for movement, tap-to-aim-and-shoot
- Smooth 60fps rendering via requestAnimationFrame

### Modify
- App.tsx to render the game component fullscreen
- index.css to remove default styles, set black background

### Remove
- Default placeholder content

## Implementation Plan
1. Create `Game.tsx` component with canvas ref and full game loop
2. Define TypeScript types for Player, Enemy, Bullet, Weapon, Pickup, Zone
3. Implement map generation (tiles grid with walls/obstacles)
4. Implement player movement, collision detection
5. Implement weapon system with stats and shooting mechanics
6. Implement enemy AI (state machine: roam/chase/attack)
7. Implement shrinking zone logic with damage-over-time
8. Implement pickup spawning and collection
9. Implement Canvas rendering (map, entities, HUD, minimap)
10. Implement start screen and game over screen
11. Implement touch controls for mobile
12. Wire everything into App.tsx
