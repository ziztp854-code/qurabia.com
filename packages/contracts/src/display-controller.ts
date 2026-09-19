export const DISPLAY_CONTROLLER_EVENTS = {
  join: 'display:join',
  resume: 'display:resume',
  action: 'display:action',
  state: 'display:state',
  error: 'display:error',
} as const;

export type DisplayControllerEvent =
  (typeof DISPLAY_CONTROLLER_EVENTS)[keyof typeof DISPLAY_CONTROLLER_EVENTS];

export type DisplayControllerRole = 'display' | 'controller' | 'player' | 'host';

export type DisplayControllerGameMode = 'mafia' | 'infiltrator' | 'millionaire' | 'category-board';

export type DisplayJoinPayload = {
  roomCode: string;
  role: DisplayControllerRole;
  mode: DisplayControllerGameMode;
  subjectId?: string;
  resumeToken?: string;
  lastStateVersion?: number;
};

export type DisplayResumePayload = {
  roomCode: string;
  resumeToken: string;
  lastStateVersion: number;
};

export type DisplayActionPayload<TAction extends string = string, TPayload = unknown> = {
  roomCode: string;
  subjectId: string;
  actionId: string;
  action: TAction;
  payload: TPayload;
  expectedStateVersion?: number;
};

export type DisplayStatePayload<TState = unknown> = {
  roomCode: string;
  mode: DisplayControllerGameMode;
  stateVersion: number;
  serverAt: string;
  state: TState;
};

export type DisplayErrorPayload = {
  roomCode?: string;
  code: 'INVALID_ROOM' | 'STALE_STATE' | 'UNAUTHORIZED' | 'INVALID_ACTION' | 'SERVER_ERROR';
  message: string;
  currentStateVersion?: number;
};

export type DisplayControllerClientToServerEvents = {
  [DISPLAY_CONTROLLER_EVENTS.join]: (payload: DisplayJoinPayload) => void;
  [DISPLAY_CONTROLLER_EVENTS.resume]: (payload: DisplayResumePayload) => void;
  [DISPLAY_CONTROLLER_EVENTS.action]: (payload: DisplayActionPayload) => void;
};

export type DisplayControllerServerToClientEvents = {
  [DISPLAY_CONTROLLER_EVENTS.state]: (payload: DisplayStatePayload) => void;
  [DISPLAY_CONTROLLER_EVENTS.error]: (payload: DisplayErrorPayload) => void;
};
