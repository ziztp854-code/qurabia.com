# Community artwork

Original image-generation assets created for this change using the user's realistic metallic/jewelry direction and royal entrance reference. These are generated photographic-style assets, not photographs of existing physical products.

Runtime delivery uses WebP (quality 90, alpha quality 100). No external image-generation service is required by the app. Original PNG outputs remain in the session's generated-images workspace; runtime PNG duplicates are omitted.

- `badge-atlas.webp`: 1774 × 887, six columns × three rows, order in `REAL_BADGE_IDS`.
- `frame-atlas.webp`: 1536 × 1024, three columns × two rows, ordinary/silver/gold/diamond/royal/legend. Portrait centers and outside areas are transparent.
- `entrance-atlas.webp`: 1774 × 887, six nameplates. Display crop coordinates are in `ENTRANCE_CROPS`; real user names and avatars render separately.
- `voice-majlis.webp`: 1672 × 941, realistic default room image.

Built-in artwork does not confer a grant or account role. Custom administrator-uploaded images take precedence where configured.

Exclusive account overlays (user-approved reference, 21 October 2026):

- `frame-owner-sapphire.webp`: 768 × 768, 139094 bytes, refined champagne-gold crown, midnight enamel and blue sapphires. Updated 26 October 2026; see [browser review](../../../../docs/visual-evidence/owner-frame-refinement/README.md).
- `frame-amira-rose.webp`: 768 × 768, 213146 bytes, rose gold, pink gems and pearls.

Generated from the user's approved board with transparent portrait holes and exterior alpha. Original masters are 1254 × 1254 PNGs in the session workspace (`exec-660e7202-f8ec-4945-8c62-aedfa23f09d9.png` and `exec-e96e3e04-edfa-4942-b33c-672d21c98de8.png`). Sharp only resizes and encodes WebP; the artwork itself is produced by the image-generation tool. Both center and corner alpha are zero. No third-party stock assets or additional client libraries are included. Existing atlas files remain unchanged.

The owner's refined frame replaces its original artwork with a newly generated 1254 × 1254 transparent master, `exec-ad2c38b2-bbc0-40d8-b392-2ed44017e59d.png`, retained in `/workspace/generated_images` for this session. It retains the existing asset URL, crown/sapphire identity and portrait alignment. Delivery is 768 × 768 WebP, quality 90 / alpha quality 100, 22.1% fewer bytes than the previous owner frame. The Amira artwork and exclusive grants are unchanged.

Artwork URLs are public for display; ownership and equip/grant permissions are enforced separately on the server and by database constraints. These frames confer no role or rank.

Matching exclusive entrance banners: `entrance-owner-sapphire.webp` (1200 × 400, 133866 bytes) and `entrance-amira-rose.webp` (1200 × 400, 157756 bytes). Original generated PNGs are 2172 × 724 (`exec-f2885c6c-1f9e-4b77-ac08-4521f24a9c92.png`, `exec-efd480d3-3910-4e61-9a64-4a0cc5533d14.png`). Name and photograph are live account content, not baked into the scene. Existing bounded entrance animation, reduced-motion handling and user opt-out are reused.
