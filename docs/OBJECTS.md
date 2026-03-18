Here's exactly what you need and where to get each file:
  ::view-transition-group(*),
  ::view-transition-old(*),
  ::view-transition-new(*) {
    animation-duration: 0.25s;
    animation-timing-function: cubic-bezier(0.19, 1, 0.22, 1);
  }
VvisualizeVvisualize show_widgetYour actual shopping list
Start here — these two sites cover 90% of what you need, all free, CC0 licensed:
kenney.nl — download the "Furniture Kit" and "Character Pack" packs. These are designed to work together, same poly count, same scale, same flat color style. Exactly the Luke HQ aesthetic. All .glb, all free, no attribution required.
quaternius.com — download "Ultimate Modular Characters" and "Furniture Pack." Better quality than Kenney, still free CC0. The characters already have idle and walk animations baked in, which saves you the Mixamo step entirely.
mixamo.com — only needed if the character models you pick don't have animations. Upload your .glb, pick "idle", "walk", "sit", download back as .glb. Free with an Adobe account.
The one thing that makes it look like the screenshot
The Luke HQ aesthetic isn't about the models — it's about the camera and lighting. You need:

Isometric-ish camera — OrthographicCamera in Three.js, positioned at roughly 45° angle looking down. Not a perspective camera. This is what gives it that flat board-game feel.
No shadows or very soft shadows — one warm DirectionalLight from above-front, one soft AmbientLight for fill. No hard shadows.
Flat materials — MeshLambertMaterial or MeshToonMaterial, not MeshStandardMaterial. This kills the shiny-ness and keeps everything matte and low-poly looking.

allow the user to be able to drag the camera around to orbit the world. 

Those three things matter more than which specific .glb files you use.
File structure for the project
/public
  /models
    /characters
      sim_base.glb          ← Quaternius character, all animations included
    /furniture
      desk.glb
      chair.glb
      sofa_red.glb
      sofa_blue.glb
      bed.glb
      monitor.glb
      bookshelf.glb
      plant_tall.glb
      lamp_floor.glb
      treadmill.glb
      kitchen_counter.glb
      fridge.glb
  /textures
    floor_wood.jpg
    wall_plaster.jpg
