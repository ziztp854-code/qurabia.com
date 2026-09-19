/** Classic live broadcast only accepts QUIZ packs — never ladder/millionaire/etc. */
export function isClassicLiveQuizMode(gameMode: string | null | undefined): gameMode is 'QUIZ' {
  return gameMode === 'QUIZ';
}
