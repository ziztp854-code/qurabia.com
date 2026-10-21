import { registerRootComponent } from 'expo';
import { registerGlobals } from '@livekit/react-native';

// Initialize WebRTC globals before loading application modules or constructing rooms.
registerGlobals();
const { registerVoiceBackgroundTask } = require('./src/voice');
registerVoiceBackgroundTask();
const App = require('./App').default;
registerRootComponent(App);
