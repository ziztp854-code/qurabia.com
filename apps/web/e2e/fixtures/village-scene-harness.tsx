import { createRoot } from 'react-dom/client';
import { KingdomsClient } from '../../src/components/kingdoms/kingdoms-client';
import '../../src/app/globals.css';

createRoot(document.getElementById('root')!).render(<KingdomsClient />);
