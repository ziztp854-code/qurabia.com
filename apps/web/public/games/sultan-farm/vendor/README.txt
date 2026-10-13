Three.js 0.186.0, copied from the existing @tahaddi/web dependency.
three.module.js and three.core.js are distribution files minified with the project esbuild for delivery; no API or semantic changes. GLSL indentation and trailing whitespace are normalized for repository checks.
OrbitControls.js is the distribution example with its three import changed to ./three.module.js for same-origin static hosting, then minified with esbuild.
MIT license and copyright are retained in LICENSE.three.txt.

Village models and material textures in ../world.js are original procedural geometry and Canvas textures.
Photographic wheat textures reuse the project's generated, transparent Sultan Farm plant set.
Asset provenance is recorded in docs/sultan-farm-assets.md; no Township models, artwork, branding or source code are included.
