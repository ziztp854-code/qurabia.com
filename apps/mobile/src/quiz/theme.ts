import { theme as native } from '../theme';

// Compatibility aliases for the recovered quiz screens. Native tokens remain authoritative.
export const theme = {
  ...native,
  colors: { ...native.colors, textSoft: native.colors.muted, surfaceSoft: native.colors.input,
    goldHover: native.colors.goldLight, onGold: native.colors.ink, borderGold: native.colors.border,
    ghost: native.colors.surfaceStrong, goldTint: native.colors.goldSoft,
    successTint: native.colors.successSoft, dangerTint: native.colors.dangerSoft },
  fonts: { body: native.fonts.regular, bodySemibold: native.fonts.semibold,
    bodyBold: native.fonts.bold, heading: native.fonts.bold },
  gradients: { card: undefined, gold: undefined },
} as const;
