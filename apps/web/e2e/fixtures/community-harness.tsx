// Opt-in browser presentation fixture. Data and successful writes are synthetic.
import { VoiceHarness, VoiceEntranceGallery } from './voice-harness';
import { CommunityArtHarness } from './community-art-harness';
import { createRoot } from 'react-dom/client';
import { CommunityProfilePage } from '../../src/components/community/profile-view';
import { AppearanceEditor } from '../../src/components/community/appearance-editor';
import { AdminIdentity } from '../../src/components/community/admin-identity';
import { CommandProfile } from '../../src/components/profile/command-profile';
import {
  fixtureAdmin,
  fixtureAppearance,
  fixtureProfile,
} from '../../src/components/community/community-fixtures';
import './visual-excellence-fonts';
import '../../src/app/globals.css';

const surface = new URLSearchParams(location.search).get('surface');
createRoot(document.getElementById('root')!).render(
  <main style={{ maxWidth: 1240, marginInline: 'auto', padding: 'clamp(12px, 3vw, 32px)' }}>
    {surface === 'entrances' ? (
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
