// Opt-in browser presentation fixture. Data and successful writes are synthetic.
import { VoiceHarness, VoiceEntranceGallery } from './voice-harness';
import { CommunityArtHarness } from './community-art-harness';
import { createRoot } from 'react-dom/client';
import { CommunityProfilePage } from '../../src/components/community/profile-view';
import { AppearanceEditor } from '../../src/components/community/appearance-editor';
import { AdminIdentity } from '../../src/components/community/admin-identity';
import { CommandProfile } from '../../src/components/profile/command-profile';
import { CommunityAvatar } from '../../src/components/community/community-ui';
import { Avatar } from '../../src/components/voice/voice-ui';
import {
  fixtureAdmin,
  fixtureAppearance,
  fixtureProfile,
} from '../../src/components/community/community-fixtures';
import './visual-excellence-fonts';
import '../../src/app/globals.css';
import '../../src/app/voice/voice.css';

const surface = new URLSearchParams(location.search).get('surface');
// Synthetic presentation only: this does not grant cosmetics or load account 1.
const ownerFrame = {
  ...fixtureProfile.frame!,
  id: 'frame-owner-sapphire',
  name: 'إطار الياقوت الملكي',
  tier: 'royal' as const,
  assetUrl: '/community-assets/frame-owner-sapphire.webp',
};
const ownerPreview = {
  ...fixtureProfile,
  accountNumber: 1,
  name: 'معاينة الإطار الملكي',
  frame: ownerFrame,
  avatarUrl: '/avatars/ghaith.png',
};
createRoot(document.getElementById('root')!).render(
  <main style={{ maxWidth: 1240, marginInline: 'auto', padding: 'clamp(12px, 3vw, 32px)' }}>
    {surface === 'owner-frame' ? (
      <>
        <CommunityProfilePage accountNumber={1} initialProfile={ownerPreview} />
        <section aria-label="معاينة مقاسات الإطار" style={{ marginBlockStart: 32 }}>
          <h2>الصورة في الملف والمجلس</h2>
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 24 }}>
            <CommunityAvatar
              name={ownerPreview.name}
              src={ownerPreview.avatarUrl}
              frame={ownerFrame}
            />
            <CommunityAvatar
              name={ownerPreview.name}
              src={ownerPreview.avatarUrl}
              frame={ownerFrame}
              size="small"
            />
            {[40, 48, 64, 112].map((size) => (
              <Avatar
                key={size}
                size={size}
                speaking
                user={{
                  name: ownerPreview.name,
                  image: ownerPreview.avatarUrl,
                  communityIdentity: ownerPreview,
                }}
              />
            ))}
            <CommunityAvatar name={ownerPreview.name} src={null} frame={ownerFrame} />
          </div>
        </section>
      </>
    ) : surface === 'entrances' ? (
      <VoiceEntranceGallery />
    ) : surface === 'art' ? (
      <CommunityArtHarness />
    ) : surface === 'voice' ? (
      <VoiceHarness />
    ) : surface === 'appearance' ? (
      <AppearanceEditor initialData={fixtureAppearance} />
    ) : surface === 'admin' ? (
      <AdminIdentity canGrantSensitive initialData={fixtureAdmin} />
    ) : surface === 'before' ? (
      <CommandProfile
        accountNumber={fixtureProfile.accountNumber}
        name={fixtureProfile.name}
        email="fixture@example.test"
        role="USER"
        status="ACTIVE"
        stats={[]}
      />
    ) : (
      <CommunityProfilePage
        accountNumber={fixtureProfile.accountNumber}
        initialProfile={fixtureProfile}
      />
    )}
  </main>,
);
