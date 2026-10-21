// Local presentation fixture: actual room UI, synthetic HTTP, no media capture.
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/cairo';
import '../../tokens.css';
import '../../src/app/globals.css';
import '../../src/app/voice/voice.css';
import { VoiceRoomView } from '../../src/components/voice/voice-room';
const root = createRoot(document.getElementById('root')!);
window.addEventListener('live-room-fixture-unmount', () => root.unmount());
root.render(
  <VoiceRoomView
    roomId="responsive-fixture"
    user={{ id: 'host', name: 'عبدالعزيز بن سلطان', image: null }}
  />,
);
