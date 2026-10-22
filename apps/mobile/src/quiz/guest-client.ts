import { fetch as expoFetch } from 'expo/fetch';
import { createGuestQuizClient } from './guest-transport';

// Build configuration selects the origin. Incoming links never choose it.
export const quizClient = createGuestQuizClient(
  process.env.EXPO_PUBLIC_API_URL || 'https://qurabia.com',
  async (url, init) => {
    const response = await expoFetch(url, init);
    return { status: response.status, url: response.url, headers: response.headers,
      text: () => response.text() };
  },
);
