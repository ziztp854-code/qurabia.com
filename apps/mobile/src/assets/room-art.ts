import type { ImageSourcePropType } from 'react-native';

// Reuse the platform's original mobile artwork. Unknown/custom covers still use
// the authenticated client's validated HTTPS asset resolver.
export function bundledRoomArt(path: string): ImageSourcePropType | undefined {
  switch (path) {
    case '/voice/covers/coffee.webp':
    case '/voice/covers/coffee-mobile.webp':
      return require('../../assets/voice-covers/coffee.webp');
    case '/voice/covers/discussion.webp':
    case '/voice/covers/discussion-mobile.webp':
      return require('../../assets/voice-covers/discussion.webp');
    case '/voice/covers/friends.webp':
    case '/voice/covers/friends-mobile.webp':
      return require('../../assets/voice-covers/friends.webp');
    case '/voice/covers/gaming.webp':
    case '/voice/covers/gaming-mobile.webp':
      return require('../../assets/voice-covers/gaming.webp');
    case '/voice/covers/oud.webp':
    case '/voice/covers/oud-mobile.webp':
      return require('../../assets/voice-covers/oud.webp');
    case '/voice/covers/quiz.webp':
    case '/voice/covers/quiz-mobile.webp':
      return require('../../assets/voice-covers/quiz.webp');
    case '/voice/covers/studio.webp':
    case '/voice/covers/studio-mobile.webp':
      return require('../../assets/voice-covers/studio.webp');
    default: return undefined;
  }
}
