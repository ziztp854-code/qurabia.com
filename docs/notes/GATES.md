# Gates: official homepage hero assets

OWNS: GATES.md, apps/web/src/app/page.tsx, apps/web/src/app/page.test.tsx, apps/web/src/components/home/prestige-home.tsx, apps/web/src/components/home/prestige-stage.tsx, apps/web/src/components/home/prestige-home.module.css, apps/web/e2e/home-mafia.spec.ts, apps/web/public/home/*

Scope: Replace only the homepage Hero imagery with the four official, separate ZIP assets while preserving the verified live routes, room-code flow, authentication/header controls, RTL behavior, real audience data, and the already requested homepage section order.

- [ ] G1: homepage component tests protect the official asset names, requested copy, real audience metrics, dedication interaction, and existing public routes
  CHECK: pnpm --filter @tahaddi/web test -- src/app/page.test.tsx
  EXPECT: Tests  6 passed

- [ ] G2: homepage E2E passes at the requested mobile, tablet, and desktop widths without horizontal overflow, undersized touch targets, or broken responsive navigation
  CHECK: pnpm --filter @tahaddi/web exec playwright test e2e/home-mafia.spec.ts --grep "الصفحة الرئيسية"
  EXPECT: 20 passed

- [ ] G3: the public homepage remains accessible
  CHECK: pnpm --filter @tahaddi/web exec playwright test e2e/accessibility.spec.ts --grep "في /$"
  EXPECT: 2 passed

- [ ] G4: the changed homepage files pass lint and the web TypeScript project remains valid
  CHECK: pnpm --filter @tahaddi/web exec eslint src/app/page.tsx src/app/page.test.tsx src/components/home/prestige-home.tsx src/components/home/prestige-stage.tsx e2e/home-mafia.spec.ts
  EXPECT: exit code 0

- [ ] G5: the web TypeScript project remains valid
  CHECK: pnpm --filter @tahaddi/web typecheck
  EXPECT: tsc --noEmit

- [ ] G6: the production web bundle builds successfully
  CHECK: pnpm --filter @tahaddi/web build
  EXPECT: Compiled successfully

- [ ] G7: local screenshots at 320x800, 360x800, 390x844, 430x932, 768x1024, 820x1180, 1366x768, 1440x900, and 1920x1080 use the official separate assets, preserve the requested composition, and have no horizontal overflow
  EVIDENCE: pending
