import { createQuizApi } from './api';
import { quizClient } from './guest-client';
export const { requestJoin, postRoom } = createQuizApi(quizClient.request);
